# Runbook · Restaurar un backup

> Restaurar **reemplaza datos**. En producción requiere aprobación explícita de Luciano (CLAUDE.md).

## Dónde están los backups

| Lugar | Contenido | Retención |
|---|---|---|
| VPS `/var/backups/agencyos/<entorno>/<fecha>/` | `db.dump` (pg_dump custom), `files.tar.gz`, `SHA256SUMS` | 3 diarios + 3 pre-deploy |
| Google Drive `agencyos-crypt:<entorno>/daily|weekly|monthly/<fecha>/` (cifrado con rclone crypt) | Lo mismo | 7 diarios, 4 semanales, 6 mensuales |

Contraseñas de rclone crypt: Bitwarden → "AGENCYOS · rclone crypt".

## 0. Probar antes de tocar nada

```bash
cd /opt/agencyos
infra/scripts/restore-test.sh prod            # baja el último de Drive y lo restaura en un contenedor efímero
infra/scripts/restore-test.sh prod --local    # idem con el último local
```

Si esto falla, **el backup está roto**: probá con otro (paso 1, elegir fecha).

## 1. Elegir y traer el backup

```bash
ls /var/backups/agencyos/prod/                       # locales
rclone lsf --dirs-only agencyos-crypt:prod/daily     # remotos (también weekly/ y monthly/)
B=/var/backups/agencyos/restore-$(date +%s); mkdir -p "$B"
rclone copy agencyos-crypt:prod/daily/<fecha> "$B"   # o: cp -a /var/backups/agencyos/prod/<fecha>/. "$B"
(cd "$B" && sha256sum -c SHA256SUMS)
```

## 2. Restaurar la base (producción)

```bash
alias dc='docker compose -f /opt/agencyos/infra/docker-compose.yml'
dc --profile prod stop web worker                     # nadie escribe mientras tanto
infra/scripts/backup.sh prod --no-upload              # copia del estado actual, por las dudas
dc --profile prod exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
dc --profile prod exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --exit-on-error' < "$B/db.dump"
```

## 3. Restaurar los archivos

```bash
docker run --rm --network none -v agencyos_files:/dst -v "$B":/src:ro postgres:17-bookworm \
  sh -c 'find /dst -mindepth 1 -delete && tar -C /dst -xzf /src/files.tar.gz && chown -R 1000:1000 /dst'
```

## 4. Volver a levantar y verificar

```bash
dc --profile prod up -d web worker
curl -fsS https://<dominio>/api/health
```

Entrar, revisar Hoy, un proyecto y un cliente. Anotar en `docs/incidentes/AAAA-MM-DD.md` qué se restauró y por qué.

## Volver al estado previo a un deploy

`deploy.sh prod` guarda un dump en `/var/backups/agencyos/prod/<fecha>-predeploy/` antes de migrar. Para volver:

1. `infra/scripts/rollback.sh prod <tag-anterior>` (código viejo).
2. Pasos 2 y 4 con `B=/var/backups/agencyos/prod/<fecha>-predeploy` (los archivos no cambian en un deploy).

## Staging

Igual, con `--profile staging`, servicios `web-stg worker-stg postgres-stg` y volumen `agencyos_files_stg`. Staging no tiene backups automáticos (sus datos son de prueba).
