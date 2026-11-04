# Runbook · Rollback

Volver a una versión anterior **del código** en segundos, sin rebuild. No toca la base.

## Automático

`deploy.sh` ya hace rollback solo si la versión nueva no pasa el health check. El workflow queda en rojo con el log.

## Manual

Por SSH (`ssh deploy@<IP>`, `cd /opt/agencyos`):

```bash
infra/scripts/rollback.sh prod --list        # historial: fecha, tag, versión, ref
infra/scripts/rollback.sh prod               # vuelve al deploy anterior
infra/scripts/rollback.sh prod 1a2b3c4d5e6f  # o a un tag concreto (sha de 12) / v0.2.0
```

Desde GitHub (sin abrir una terminal): no hay botón; la clave de CI admite `rollback prod`, pero se usa por SSH. Si hace falta, Claude lo ejecuta con aprobación de Luciano.

El script: verifica que existan las imágenes, levanta web + worker con ese tag, espera el health check y registra el cambio en el historial (`rollback-from-<tag>`).

## Si la versión vieja tampoco anda

Lo más probable es que **una migración** haya dejado la base incompatible con el código viejo.

1. No sigas probando versiones al azar.
2. Restaurá el backup **pre-deploy** (se hace siempre antes de migrar en prod): [`restore-backup.md`](restore-backup.md), sección "Volver al estado previo a un deploy".
3. Registrá el incidente en `docs/incidentes/AAAA-MM-DD.md`.

## Después del rollback

- Abrir una issue con el log del deploy fallido (Actions → run → job).
- El arreglo entra como un nuevo commit/tag; **no** se reescribe el tag fallido.
