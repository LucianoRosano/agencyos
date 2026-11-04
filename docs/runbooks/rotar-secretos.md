# Runbook · Rotar secretos

Cuándo: sospecha de filtración, salida de alguien con acceso, o rutina anual. Siempre: **primero staging, después producción**. Toda rotación queda anotada en `docs/incidentes/` (si es por incidente) o en el commit/PR.

Los secretos del VPS viven en `infra/.env.prod` y `infra/.env.staging` (permisos 600). Copia de los críticos en Bitwarden.

```bash
cd /opt/agencyos
alias dc='docker compose -f /opt/agencyos/infra/docker-compose.yml'
nano infra/.env.prod                      # editar el valor
dc --profile prod up -d web worker        # aplicar (recrea los contenedores con el env nuevo)
```

## `AUTH_SECRET` (sesiones)

1. `openssl rand -hex 32` → reemplazar en `infra/.env.prod` y en Bitwarden.
2. Aplicar. **Efecto:** se cierran todas las sesiones (hay que volver a entrar con 2FA).

## `APP_ENCRYPTION_KEY` (clave maestra de tokens de integraciones)

Cifrado de sobre (docs/08 §4): cada token tiene su clave de datos, cifrada con la maestra. Rotar = re-cifrar las claves de datos.

1. Guardar la clave **vieja** en Bitwarden como "APP_ENCRYPTION_KEY (anterior, AAAA-MM-DD)".
2. Generar la nueva: `openssl rand -hex 32`.
3. Re-cifrar con la CLI de administración (cuando exista el comando `rotate-encryption-key` en `pnpm admin`):
   `dc --profile prod run --rm -e OLD_KEY=<vieja> -e NEW_KEY=<nueva> worker pnpm admin rotate-encryption-key`
4. Poner la nueva en `infra/.env.prod`, aplicar, verificar que las integraciones sigan funcionando (Configuración → Integraciones).
5. Si **no** hay comando de re-cifrado todavía: cambiar la clave invalida los tokens guardados → hay que reconectar cada integración a mano. Hoy (v0.x) todavía no hay tokens cifrados en uso.

## Contraseña de PostgreSQL

```bash
NEW=$(openssl rand -hex 24)
dc --profile prod exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"alter user \\\"\$POSTGRES_USER\\\" with password '$NEW'\""
# Actualizar POSTGRES_PASSWORD y la clave dentro de DATABASE_URL en infra/.env.prod
dc --profile prod up -d web worker
unset NEW
```

## `SETUP_TOKEN`

Solo sirve mientras no existe la cuenta del dueño. Después se puede borrar la línea (o dejarla vacía). Rotar: `openssl rand -hex 16`.

## Basic auth de staging

```bash
docker run --rm -it caddy:2-alpine caddy hash-password    # escribir la contraseña nueva
nano infra/.env   # STAGING_BASIC_AUTH_HASH='<hash>' (con comillas simples)
dc up -d caddy
```

## Claves SSH

- **Clave de GitHub Actions:** generar un par nuevo (`ssh-keygen -t ed25519 -f agencyos_ci`), reemplazar la línea `command="…ci-ssh-gate.sh"…` en `~deploy/.ssh/authorized_keys` (mantener el prefijo `command=…,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty`), actualizar el secret `VPS_SSH_KEY` en GitHub.
- **Deploy key de lectura del repo:** `ssh-keygen -t ed25519 -f ~/.ssh/github_agencyos -N ""` en el VPS, cargarla en GitHub → Deploy keys y borrar la vieja.
- **Tu clave personal:** agregar la nueva a `authorized_keys`, probar, después borrar la vieja.

## Brevo, rclone y otros

- **`BREVO_API_KEY`:** crear una nueva en Brevo, reemplazar, aplicar, **revocar la vieja** en Brevo.
- **rclone (token de Google):** `rclone config reconnect gdrive:`. Revocar el acceso viejo en <https://myaccount.google.com/permissions>.
- **Contraseña de rclone crypt:** NO se rota "en caliente" (los backups viejos quedan con la anterior). Crear un remote crypt nuevo (`agencyos-crypt2`, otra carpeta), apuntar `RCLONE_REMOTE` a él y conservar la contraseña vieja en Bitwarden mientras existan backups viejos (6 meses).
