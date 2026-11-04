# Runbook · Incidente de seguridad (docs/08 §10)

Ante la duda, tratarlo como incidente. Prioridad: **cortar el acceso → preservar evidencia → recuperar → aprender.**

## 1. Revocar sesiones y tokens

- En la app: **Configuración → Seguridad → "Cerrar todas las sesiones y revocar tokens"** (cuando esté disponible).
- Si la app no responde o no es confiable, desde el VPS:

  ```bash
  alias dc='docker compose -f /opt/agencyos/infra/docker-compose.yml'
  dc --profile prod exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "delete from session;"'
  ```

- Si se sospecha del servidor: GitHub → Settings → Secrets → borrar `VPS_SSH_KEY` (corta los deploys) y quitar la línea de la clave de CI de `~deploy/.ssh/authorized_keys`.
- Para cortar todo el tráfico público de inmediato: `dc stop caddy` (la app queda inaccesible desde internet).

## 2. Rotar la clave maestra y los tokens de integración

Seguir [`rotar-secretos.md`](rotar-secretos.md): `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, contraseña de Postgres, `BREVO_API_KEY`, tokens de GitHub/Google/IA, claves SSH de CI. Revocar en cada proveedor los tokens viejos.

## 3. Revisar `audit_log` y los logs

```bash
# Últimos eventos de auditoría (solo inserción: no se pueden borrar ni modificar)
dc --profile prod exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select at, actor_type, actor_id, action, target_type, target_id, ip from audit_log order by at desc limit 100;"'
# Logs de la app y de Caddy (IPs, rutas)
dc --profile prod logs --since 48h web worker > /tmp/incidente-app.log
dc logs --since 48h caddy > /tmp/incidente-caddy.log
# Acceso al servidor
sudo journalctl -u ssh --since "2 days ago" | grep -Ei 'accepted|failed'
sudo fail2ban-client status sshd
last -a | head -30
```

Guardar copias de estos archivos **fuera** del VPS antes de cambiar nada más (evidencia).

## 4. Restaurar desde backup si hace falta

Si hubo modificación o borrado de datos: [`restore-backup.md`](restore-backup.md). Elegir un backup **anterior** al inicio del incidente (Drive guarda 7 diarios, 4 semanales y 6 mensuales).

Si el servidor está comprometido a nivel sistema: no "limpiarlo". Crear un VPS nuevo ([`../DEPLOYMENT.md`](../DEPLOYMENT.md)), restaurar el último backup bueno y rotar **todos** los secretos.

## 5. Registrar el incidente

Crear `docs/incidentes/AAAA-MM-DD.md` con:

- Qué pasó y cómo se detectó (fecha/hora ART).
- Alcance: datos y cuentas afectadas.
- Acciones tomadas (con hora).
- Causa raíz.
- Qué se cambia para que no vuelva a pasar (issues enlazadas).
- Si hubo datos personales de clientes afectados: evaluar aviso a los titulares (Ley 25.326).
