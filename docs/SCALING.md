# Escalabilidad

Cómo crece AGENCYOS sin rediseñar: qué está medido, qué se configura y cuándo conviene tocar cada perilla. Decisiones: [ADR 0012](adr/0012-escalabilidad.md). Observabilidad: [OBSERVABILITY.md](OBSERVABILITY.md).

## 1. Principio
Todo el estado compartido vive en PostgreSQL (sesiones, cola pg-boss, rate limiting, exclusión entre workers, latidos) y los archivos en un `StorageAdapter` (disco o S3). Por eso las instancias web y los workers son **intercambiables**: escalar es sumar réplicas, no reescribir.

## 2. Mediciones (base de volumen)
Generadas con `pnpm seed:volumen` (1 workspace: 500 clientes, 1.000 proyectos, **50.000 tareas**, **20.000 movimientos**, **100.000 eventos** y 100.000 actividades, 5.000 notas con 10.000 enlaces, 20.000 filas de auditoría) y medidas con `pnpm explain:hot` (mediana de 5 corridas en caliente, PostgreSQL 16, contenedor de desarrollo). Medición del 19/11/2026:

| Caso de uso | Tiempo (mediana) | Consultas | Más lenta |
|---|---:|---:|---:|
| Hoy (`getToday`) | 35 ms | 35 | 3,7 ms |
| Tareas abiertas / hoy / completadas | 4,5–5 ms | 1 | 1,9 ms |
| Proyectos | 6 ms | 1 | 1,8 ms |
| Clientes | 9 ms | 1 | 5,5 ms |
| Movimientos | 9 ms | 1 | 11 ms |
| Notas (lista) | 26 ms | 1 | 23 ms |
| Búsqueda global | 6–11 ms | 1 | 9,5 ms |
| Cerebro (grafo completo) | 74 ms | 9 | 2,3 ms |
| Notificaciones / no leídas | < 1 ms | 1 | 0,1 ms |
| Outbox pendiente (worker) | 1,5 ms | 1 | 0,1 ms |
| Auditoría / actividad | 1,4–2,2 ms | 1–2 | 0,3 ms |

Los Seq Scan que quedan son sobre tablas chicas (≤ 1.000 filas: proyectos, clientes) donde el planificador elige bien. La búsqueda de texto completo de notas pasó de **1,4 s a 29 ms** con 5.000 notas gracias a un `tsvector` guardado (migración 0005).

Reproducir:
```bash
createdb -h 127.0.0.1 -U agencyos agencyos_vol
DATABASE_URL=postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_vol pnpm db:migrate
DATABASE_URL=postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_vol pnpm seed:volumen
DATABASE_URL=postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_vol pnpm explain:hot --planes
```
Los scripts se niegan a correr si la URL no contiene `test`, `vol` o `e2e`.

## 3. Qué se hizo para escalar
- **Índices guiados por medición** (migración `0005`): parciales `where deleted_at is null and archived_at is null` que coinciden con `scoped()`, compuestos con `workspace_id` primero, `domain_event (occurred_at) where dispatched_at is null` para el outbox, `tsvector` de notas.
- **Paginación por cursor (keyset)** en Tareas, Clientes, Notas, Actividad y Auditoría: "Cargar más" estable ante inserciones, sin `OFFSET`.
- **Timeouts por proceso**: `statement_timeout` 15 s (web) / 120 s (worker), `idle_in_transaction_session_timeout` 60 s, `application_name` para ver quién consume en `pg_stat_activity`.
- **Rate limiting en PostgreSQL** (`rate_limit_bucket`, ventana deslizante): funciona igual con 1 o N instancias. Reglas en [08-seguridad.md](08-seguridad.md).
- **Worker horizontal**: pg-boss encola cada cron una sola vez; además cada job programado toma un *lease* (`job_lease`) para que dos workers nunca corran el mismo a la vez. `WORKER_CONCURRENCY` por job, latido por instancia (`worker_heartbeat`) y apagado ordenado con SIGTERM.
- **Almacenamiento S3-compatible** (`STORAGE_DRIVER=s3`): Cloudflare R2, Backblaze B2, MinIO o AWS S3. Requisito para más de una instancia web en distintas máquinas.
- **JS por ruta < ~170 KB gzip**: Menu/Sheet de Radix, paleta, captura, toasts y cliente de auth cargados bajo demanda.

## 4. Escalado horizontal (cuando haga falta)
1. **Archivos compartidos**: `STORAGE_DRIVER=s3` + `S3_*` (ver `.env.example`). Migrar los archivos existentes copiando `FILES_DIR` al bucket con `rclone copy` (mismas claves).
2. **Réplicas web**: en `infra/docker-compose.yml` subir `deploy.replicas` del servicio `web` (sin `container_name` ni puertos publicados) y activar el bloque `reverse_proxy { dynamic a web 3000; lb_policy least_conn; health_uri /api/health?live=1 }` comentado en `infra/Caddyfile`.
3. **Más workers**: subir `replicas` del worker; no hace falta nada más (cola + leases).
4. **Conexiones**: `N_web × DB_POOL_MAX + N_worker × (DB_POOL_MAX + WORKER_BOSS_POOL_MAX) + margen < max_connections`. Con el default (`max_connections = 100`, `DB_POOL_MAX = 10`): hasta 3 web + 2 workers con margen. Más que eso: subir `max_connections` (cada conexión ~10 MB de RAM) o PgBouncer en **modo sesión** para la web (el modo transacción rompe el lock de sesión del setup, el `LISTEN` de pg-boss y los parámetros por conexión).
5. **Base**: el cuello de botella real va a ser el VPS. Orden sugerido: más RAM/CPU (KVM 2 → KVM 4), luego PostgreSQL en su propio servidor, luego réplica de lectura para reportes.

## 5. Prueba de carga
`scripts/load-test.ts` (autocannon) entra con una sesión creada en la base y recorre Hoy, listas y búsqueda contra `next start`:
```bash
# servidor de producción apuntando a la base de volumen
DATABASE_URL=…/agencyos_vol AUTH_SECRET=… pnpm --filter @agencyos/web build
DATABASE_URL=…/agencyos_vol AUTH_SECRET=… pnpm --filter @agencyos/web exec next start --port 3320
# carga
DATABASE_URL=…/agencyos_vol AUTH_SECRET=… LOAD_URL=http://localhost:3320 pnpm load:test --segundos 20 --conexiones 10
```
Los resultados dependen del hardware: correrla en staging (el VPS real) y anotar acá p50/p95 y pedidos/s antes de cada cambio grande.

## 6. Alarmas que conviene configurar
Con `/api/metrics` (Prometheus) o `/api/health`: outbox pendiente > 500 durante 10 min, último latido del worker > 5 min, p95 de `/hoy` > 1,5 s, disco del almacenamiento local > 80 %, errores 5xx > 1 %. Detalle en [OBSERVABILITY.md](OBSERVABILITY.md).
