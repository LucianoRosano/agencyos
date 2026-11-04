# Runbook · Deploy

Primera instalación: [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md). Esto es la operación de todos los días.

## Flujo normal (automático)

| Evento | Workflow | Qué corre en el VPS |
|---|---|---|
| Push / merge a `main` | `.github/workflows/deploy-staging.yml` | `deploy staging <sha>` |
| Tag `vX.Y.Z` + aprobación de Luciano | `.github/workflows/deploy-prod.yml` (environment `production`) | `deploy prod vX.Y.Z` |

GitHub entra por SSH con una clave **restringida** a `infra/scripts/ci-ssh-gate.sh`, que valida la orden y llama a `infra/scripts/deploy.sh`.

## Qué hace `deploy.sh <staging|prod> <ref>`

1. Lock global (`infra/.deploy/.lock`): un deploy/rollback a la vez.
2. `git fetch` + `checkout --detach` del ref. En **prod**: el ref tiene que ser un tag `vX.Y.Z` **contenido en `origin/main`**.
3. Imágenes `agencyos-web:<sha12>` y `agencyos-worker:<sha12>`: si ya existen (las construyó staging) se **reutilizan**; si no, `docker build`.
4. Levanta la base del entorno. En **prod**: `backup.sh prod --pre-deploy` (dump local; si falla, **no se despliega**).
5. Migraciones: `docker compose --profile <p> run --rm migrate[-stg]` (drizzle migrator, con la imagen nueva). Si fallan, la versión anterior sigue en línea.
6. `up -d` de web + worker con el tag nuevo.
7. Health check: `GET /api/health` dentro del contenedor (incluye la base) + worker corriendo. Hasta 36 intentos × 5 s.
8. OK → actualiza `TAG_*`/`VERSION_*` en `infra/.env`, agrega una línea a `infra/.deploy/<entorno>.history` y poda imágenes viejas (conserva las de los últimos 5 deploys).
9. Falla → **rollback automático** a la imagen anterior y sale con error (el workflow queda en rojo).

## Deploy manual (desde el VPS)

```bash
ssh deploy@<IP>
cd /opt/agencyos
infra/scripts/deploy.sh staging main          # o un sha
infra/scripts/deploy.sh prod v0.3.0           # producción: SOLO con aprobación explícita de Luciano
```

## Reglas para migraciones

- Siempre **compatibles hacia atrás** (expand/contract): agregar columnas/tablas primero; borrar o renombrar en un release posterior, cuando ningún código viejo las use.
- Nada destructivo sin aprobación de Luciano (CLAUDE.md).
- Probar primero en staging. El rollback **no** revierte migraciones.

## Verificación después del deploy

```bash
curl -fsS https://<dominio>/api/health          # {"ok":true,"db":"ok","version":"v0.3.0+<sha>"}
docker compose -f infra/docker-compose.yml --profile prod ps
```

Smoke manual (hasta que exista el smoke e2e automatizado): login con 2FA, Hoy carga, crear una tarea, buscar con `Ctrl+K`.

## Problemas comunes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| "otro deploy/backup está en curso" | Deploy anterior colgado | `ps aux \| grep deploy.sh`; si no hay ninguno, borrar `infra/.deploy/.lock` |
| Build sin memoria (`Killed`) | 8 GB justos con todo corriendo | Ver `free -h`; el swap de 4 GB debería alcanzar; reintentar |
| Certificado HTTPS no sale | DNS no apunta al VPS o puertos 80/443 cerrados | `dig +short <dominio>`; `sudo ufw status`; `docker compose … logs caddy` |
| Health falla por la base | `.env.<entorno>` con DATABASE_URL incorrecta | Revisar que la clave coincida con `POSTGRES_PASSWORD` |
