# ADR 0012 · Escalabilidad, operación y observabilidad

**Estado:** aceptada · 16/11/2026 · Detalle y números: [`docs/SCALING.md`](../SCALING.md), [`docs/OBSERVABILITY.md`](../OBSERVABILITY.md).

## Contexto
AGENCYOS corre en un VPS con una instancia web, un worker y PostgreSQL (ADR 0005). Los datos crecen (decenas de miles de tareas, movimientos y eventos) y queremos poder sumar instancias sin rediseñar, y ver qué pasa en producción. Restricción: nada de servicios nuevos obligatorios (Redis, colas externas); PostgreSQL sigue siendo la única pieza con estado.

## Decisiones

1. **Todo el estado compartido vive en PostgreSQL.** Sesiones (Better Auth), rate limiting (`rate_limit_bucket`), cola (pg-boss), exclusión entre workers (`job_lease`) y latidos (`worker_heartbeat`). Consecuencia: las instancias web son intercambiables y Caddy puede balancear sin afinidad.

2. **Almacenamiento: interfaz `StorageAdapter` con dos drivers.** Disco (default, `FILES_DIR`) o S3-compatible (`STORAGE_DRIVER=s3`: R2, B2, MinIO, S3) con `@aws-sdk/client-s3` cargado de forma diferida y checksums "cuando se requieren" (compatibilidad con R2/B2). **Las descargas siguen pasando por la ruta autenticada** (sesión + URL firmada de la app + headers de seguridad + rate limit); no usamos URLs prefirmadas del proveedor. Motivos: el bucket nunca se expone, los permisos y la auditoría siguen siendo los de AGENCYOS, y los tamaños (≤ 25 MB) no justifican descargar directo. Por eso no se agregó `@aws-sdk/s3-request-presigner`. Si algún día hay archivos grandes (video), se agrega un redirect 302 a una URL prefirmada de 60 s.

3. **Índices guiados por medición.** `scripts/seed-volumen.ts` + `scripts/explain-hot.ts` (EXPLAIN ANALYZE de las consultas reales). Índices parciales `where deleted_at is null and archived_at is null` (y por estado en tareas) que coinciden con `scoped()`, ascendentes (un recorrido hacia atrás sirve a `order by … desc`, nulls first). El extracto de notas pasó a `f_note_snippet()` (plpgsql, `COST 1000`) para que el planificador lo evalúe después del `LIMIT`. Migración `0005_indices_escala.sql` (con `IF NOT EXISTS`; `CREATE INDEX` sin `CONCURRENTLY` porque el migrador corre en transacción y las tablas son chicas: segundos).

4. **Paginación por cursor (keyset), acumulativa y sin JS.** `?hasta=<cursor>` = "todo hasta esa fila + la página siguiente"; el cursor es la tupla de orden renderizada por PostgreSQL (`json_build_array`, sin perder microsegundos) en base64url. Estable ante altas y bajas (sin OFFSET). Tope de 2.000 filas acumuladas; con búsqueda por relevancia (notas) no se pagina.

5. **Pools y timeouts por rol de proceso.** `application_name` (`agencyos-web`, `agencyos-worker`), `statement_timeout` 15 s web / 120 s worker / sin límite en migraciones y scripts, `idle_in_transaction_session_timeout` 60 s. **Sin PgBouncer en modo transacción**: el setup inicial usa `pg_advisory_lock` de sesión, pg-boss usa `LISTEN/NOTIFY` y locks de sesión, y los parámetros por conexión (`statement_timeout`, `application_name`) se pierden. Si hiciera falta (muchas réplicas), PgBouncer en **modo sesión** para la web, y el worker conectado directo. Dimensionamiento en SCALING.md.

6. **Rate limiting general en PostgreSQL** (ventana deslizante aproximada con dos ventanas fijas, un UPSERT por pedido, identificadores hasheados, fail-open si la base falla). Reglas por superficie: `/p/[token]`, decisión pública, webhooks, `/mcp`, descarga y subida de archivos. El de login sigue siendo el de Better Auth. A la escala de AGENCYOS (decenas de req/s) el costo es despreciable; si creciera, la misma interfaz admite un backend en memoria compartida.

7. **Worker escalable.** pg-boss ya encola cada ocurrencia de cron una sola vez entre réplicas; además cada job programado toma un **lease** (`job_lease`, TTL renovado mientras corre) para que dos workers nunca corran el mismo job a la vez (p. ej. un outbox lento que se superpone con el minuto siguiente). `WORKER_CONCURRENCY` controla la concurrencia de colas no exclusivas. SIGTERM: deja de tomar jobs, espera los que están en curso (25 s, `stop_grace_period: 40s`) y libera leases. El contenedor arranca `tsx` directo (no `pnpm start`) para recibir la señal.

8. **Observabilidad sin dependencias obligatorias.** Logs JSON unificados (web y worker) con `requestId` (Caddy → proxy.ts → app). `/api/health` con chequeos (base, latido de workers, outbox, disco). `/api/metrics` Prometheus protegido con `METRICS_TOKEN`. OpenTelemetry (`@vercel/otel`) solo si hay `OTEL_EXPORTER_OTLP_ENDPOINT`.

9. **Escalado horizontal con Caddy.** `deploy.replicas` en Compose + `reverse_proxy { dynamic a web 3000; lb_policy least_conn; health_uri /api/health?live=1 }` (comentado en el Caddyfile, listo para activar). Requisito: almacenamiento compartido (S3, o el mismo volumen si las réplicas están en el mismo host).

## Consecuencias
- Activar réplicas o S3 es configuración, no código; ambos quedan como decisión de Luciano (costo y migración de archivos).
- Una migración nueva (0005) con tres tablas de operación sin `workspace_id` (no son datos de negocio).
- Las listas largas muestran "Cargar más" en lugar de cortar en 300/500 filas.
- `counts.overdue` de Hoy ahora es el total real (antes, como mucho 50).
