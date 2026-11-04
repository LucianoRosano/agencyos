# ADR 0002 · PostgreSQL autoalojado (sin Supabase)

**Estado:** aceptada · 04/11/2026

PostgreSQL estándar + Drizzle (docs/03 §1). Producción: imagen oficial `postgres:17`. Desarrollo y tests: PostgreSQL 16 y 17 (la suite de integración pasa en ambas). En la 17, las funciones usadas por índices deben calificar el esquema (`public.f_unaccent`) porque se construyen con un search_path restringido.
Búsqueda: `unaccent` (envuelto en `f_unaccent` IMMUTABLE) + `pg_trgm` con índices GIN por expresión y FTS `spanish` en notas (migración `0001_busqueda_y_auditoria.sql`). `audit_log` es de solo inserción por trigger.
