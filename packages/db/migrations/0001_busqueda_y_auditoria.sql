-- Extensiones para búsqueda tolerante a tildes y a errores leves.
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- unaccent() no es IMMUTABLE: se envuelve para poder indexar expresiones.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION f_search_norm(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(public.f_unaccent($1)) $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS client_search_trgm ON client USING gin (f_search_norm(coalesce(name,'') || ' ' || coalesce(trade_name,'')) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS contact_search_trgm ON contact USING gin (f_search_norm(coalesce(name,'') || ' ' || coalesce(email,'')) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS project_search_trgm ON project USING gin (f_search_norm(name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS task_search_trgm ON task USING gin (f_search_norm(title) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS opportunity_search_trgm ON opportunity USING gin (f_search_norm(title) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS quote_search_trgm ON quote USING gin (f_search_norm(number || ' ' || title) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS note_search_trgm ON note USING gin (f_search_norm(title) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS note_body_fts ON note USING gin (to_tsvector('spanish', f_unaccent(body_md)));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS course_search_trgm ON course USING gin (f_search_norm(name) gin_trgm_ops);
--> statement-breakpoint
-- audit_log es de solo inserción: se bloquean UPDATE y DELETE.
CREATE OR REPLACE FUNCTION audit_log_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log es de solo inserción';
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_inmutable();
