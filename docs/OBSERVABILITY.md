# Observabilidad

Qué expone AGENCYOS para saber si está sano, qué tan rápido responde y qué falló. Todo es opcional salvo los logs y `/api/health`: sin configurar nada, no hay costo ni dependencias externas. Decisiones en [ADR 0011](adr/0011-escalabilidad.md).

## 1. Logs estructurados (web y worker)

- Una línea JSON por evento, a stdout (errores a stderr): `{"level","time","msg","service","requestId",…}`. Mismo logger en la web y el worker: `packages/modules/src/shared/log.ts` (el worker lo re-exporta en `apps/worker/src/log.ts`).
- Redacción automática de claves sensibles (`password`, `token`, `secret`, `authorization`, `cookie`, `cuit`, `email`) → `"[redactado]"`.
- `LOG_LEVEL=debug` habilita `log.debug`.
- `service`: `agencyos-web` / `agencyos-worker` (o `OTEL_SERVICE_NAME`).
- Errores no capturados de páginas, Server Actions y rutas: `instrumentation.ts → onRequestError` (con ruta, método, `digest` de Next y `requestId`). Errores inesperados dentro de Server Actions (no de dominio): `lib/action.ts`.
- Caddy también loguea en JSON (bloque `log` del Caddyfile).

### requestId
1. Caddy genera `X-Request-Id` (`{http.request.uuid}`) en cada pedido, lo manda a la app y lo devuelve en la respuesta.
2. `apps/web/proxy.ts` lo propaga (o genera uno si se corre sin Caddy) en el header del pedido → disponible con `headers().get("x-request-id")` y `requestIdFrom()`.
3. `/api/*` y `/mcp` no pasan por `proxy.ts` (cuerpos grandes): ahí el id es el de Caddy.

Para seguir un pedido: `docker compose logs web caddy | grep <requestId>`.

## 2. `/api/health`

| Pedido | Uso | Respuesta |
|---|---|---|
| `GET /api/health?live=1` | liveness: Docker, Caddy (`health_uri`), Playwright | `200 {"ok":true,"version"}` |
| `GET /api/health` | readiness / monitoreo externo | `200` con `status: "ok"` o `"degraded"`; `503` si la base no responde |

Chequeos (`checks`), sin datos sensibles:
- `db`: `select` contra PostgreSQL + latencia (`ms`).
- `worker`: instancias con latido en los últimos `HEALTH_WORKER_MAX_AGE_S` (120 s) en `worker_heartbeat` (cada worker late cada 30 s). Sin workers → `warn`.
- `outbox`: eventos sin despachar y antigüedad del más viejo; `warn` si supera `HEALTH_OUTBOX_MAX_AGE_S` (600 s) — señal de worker caído o trabado.
- `storage`: con disco, % libre de `FILES_DIR` (`warn` debajo de `HEALTH_DISK_MIN_FREE_PCT`, 10 %); con S3, `skip`.

Monitoreo externo sugerido (UptimeRobot, Better Stack, Uptime Kuma): alertar si el status HTTP ≠ 200 **o** el cuerpo no contiene `"status":"ok"` durante 5 minutos.

## 3. `/api/metrics` (Prometheus)

- Protegida: `Authorization: Bearer $METRICS_TOKEN` (mín. 16 caracteres; comparación en tiempo constante). Sin `METRICS_TOKEN`, la ruta responde 404.
- Formato de exposición de texto 0.0.4. Métricas (prefijo `agencyos_`):

| Métrica | Tipo | Qué mide |
|---|---|---|
| `up`, `db_up`, `db_ping_ms` | gauge | instancia viva, base viva, latencia |
| `db_pool_connections{state=total\|idle\|waiting}` | gauge | pool de **esta** instancia (`waiting` > 0 sostenido = pool chico) |
| `db_connections{application,state}` | gauge | `pg_stat_activity` por `application_name` (`agencyos-web`, `agencyos-worker`, `agencyos-worker-worker-boss`…) |
| `db_max_connections`, `db_size_bytes` | gauge | límite y tamaño de la base |
| `worker_instances`, `worker_last_seen_age_seconds` | gauge | workers vivos y frescura del latido |
| `outbox_pending`, `outbox_oldest_age_seconds` | gauge | cola del outbox |
| `jobs_24h{job,state}` | gauge | jobs de pg-boss de las últimas 24 h por estado (`failed` > 0 = mirar) |
| `rate_limit_requests_1h{rule}` | gauge | pedidos contados por regla de rate limiting |
| `storage_free_bytes`, `storage_total_bytes` | gauge | disco de `FILES_DIR` (solo driver disco) |
| `process_resident_memory_bytes`, `process_heap_used_bytes`, `process_uptime_seconds` | gauge | proceso web |

Con varias réplicas, cada scrape cae en una instancia distinta (detrás de Caddy): las métricas de base/worker/outbox son globales; las de pool y proceso son de la instancia que respondió. Para métricas por instancia, scrapear cada réplica por la red interna de Docker (`web-1:3000`, …).

Alertas sugeridas:
- `agencyos_db_up == 0` 1 min · `agencyos_worker_instances == 0` 5 min · `agencyos_outbox_oldest_age_seconds > 600` · `sum(agencyos_db_connections) / agencyos_db_max_connections > 0.8` · `agencyos_db_pool_connections{state="waiting"} > 0` 5 min · `agencyos_storage_free_bytes / agencyos_storage_total_bytes < 0.1` · `increase` de `agencyos_jobs_24h{state="failed"}`.

## 4. Trazas y métricas OpenTelemetry (opcional)

`apps/web/instrumentation.ts` registra `@vercel/otel` **solo** si existe `OTEL_EXPORTER_OTLP_ENDPOINT` (si no, no se carga nada). Next.js emite spans de cada pedido, render, Server Action y `fetch`; las variables estándar de OpenTelemetry (`OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_TRACES_SAMPLER`…) funcionan igual.

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=agencyos-web
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.2
```

## 5. Conectar a SigNoz

1. Levantar SigNoz (self-hosted con su docker-compose, en otro host o con ≥ 4 GB libres; o SigNoz Cloud).
2. Trazas: `OTEL_EXPORTER_OTLP_ENDPOINT=http://<signoz-otel-collector>:4318` (Cloud: `https://ingest.<región>.signoz.cloud:443` + `OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=<clave>`; la clave en Bitwarden, nunca en el repo).
3. Logs: el colector de SigNoz puede leer los logs de Docker (receptor `filelog` sobre `/var/lib/docker/containers/*/*.log` con parser JSON) — los campos `level`, `service` y `requestId` quedan como atributos.
4. Métricas: agregar en el colector un receptor `prometheus` que scrapee `https://<dominio>/api/metrics` con `authorization: Bearer <METRICS_TOKEN>` cada 60 s.

## 6. Conectar a Grafana (Prometheus + Loki + Tempo)

- **Prometheus** (`prometheus.yml`):
  ```yaml
  scrape_configs:
    - job_name: agencyos
      scheme: https
      metrics_path: /api/metrics
      authorization: { type: Bearer, credentials_file: /etc/prometheus/agencyos_token }
      scrape_interval: 60s
      static_configs: [{ targets: ["<dominio>"] }]
  ```
- **Loki**: Grafana Alloy/Promtail con `docker_sd_configs` y una etapa `json` que extraiga `level`, `service`, `requestId`.
- **Tempo**: `OTEL_EXPORTER_OTLP_ENDPOINT=http://<alloy-o-tempo>:4318`.
- Grafana Cloud (free tier) sirve para las tres cosas sin instalar nada en el VPS.

## 7. Worker

- Latido por instancia en `worker_heartbeat` (cada 30 s) y, si se define `WORKER_HEARTBEAT_FILE`, `touch` del archivo (lo usa `infra/docker/worker-healthcheck.mjs`).
- Cada job no silencioso loguea `job ok` / `job falló` con duración; los que salteó por lease (otro worker lo tenía), `job salteado`.
- Configuración → Estado muestra el último latido, la cola de pg-boss y los jobs fallidos de 7 días.
