# ADR 0002 · PostgreSQL autoalojado (sin Supabase)

**Estado:** aceptada · 04/11/2026

PostgreSQL estándar + Drizzle (docs/03 §1). Producción: imagen oficial `postgres:17`. Desarrollo y tests en este entorno: PostgreSQL 16 (Docker Hub limitado); no se usa nada exclusivo de la 17.
Búsqueda: `unaccent` (envuelto en `f_unaccent` IMMUTABLE) + `pg_trgm` con índices GIN por expresión y FTS `spanish` en notas (migración `0001_busqueda_y_auditoria.sql`). `audit_log` es de solo inserción por trigger.
