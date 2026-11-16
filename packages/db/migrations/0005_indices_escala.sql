CREATE TABLE IF NOT EXISTS "job_lease" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_bucket" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_bucket_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_heartbeat" (
	"instance_id" text PRIMARY KEY NOT NULL,
	"hostname" text NOT NULL,
	"pid" integer NOT NULL,
	"version" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"running_jobs" integer DEFAULT 0 NOT NULL,
	"concurrency" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "link_ws_from_id" ON "link" USING btree ("workspace_id","from_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_unread" ON "notification" USING btree ("user_id","workspace_id") WHERE "notification"."read_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interaction_next_step" ON "interaction" USING btree ("workspace_id","next_step_due") WHERE "interaction"."next_step_due" is not null and "interaction"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunity_client" ON "opportunity" USING btree ("client_id") WHERE "opportunity"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_ws_list" ON "transaction" USING btree ("workspace_id","date","id") WHERE "transaction"."deleted_at" is null and "transaction"."archived_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_pair" ON "transaction" USING btree ("transfer_pair_id") WHERE "transaction"."transfer_pair_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_ws_list" ON "note" USING btree ("workspace_id","pinned","updated_at","id") WHERE "note"."deleted_at" is null and "note"."archived_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_open_due" ON "task" USING btree ("workspace_id","due_date","priority","id") WHERE "task"."deleted_at" is null and "task"."archived_at" is null and "task"."status" in ('todo','doing','waiting');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_open_priority" ON "task" USING btree ("workspace_id","priority","due_date") WHERE "task"."deleted_at" is null and "task"."archived_at" is null and "task"."status" in ('todo','doing','waiting');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_done_completed" ON "task" USING btree ("workspace_id","completed_at","id") WHERE "task"."deleted_at" is null and "task"."archived_at" is null and "task"."status" = 'done';--> statement-breakpoint
-- Extracto de notas para listas (antes: regexp_replace sobre el cuerpo entero de TODAS las notas, ~1 s con 5.000 notas).
-- plpgsql (no se "inlinea") y COST alto: el planificador lo evalúa después del ORDER BY/LIMIT, solo en las filas devueltas.
-- Recorta antes de limpiar: el extracto es de 180 caracteres.
CREATE OR REPLACE FUNCTION public.f_note_snippet(body text, n integer DEFAULT 180) RETURNS text
  LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE COST 1000 AS $$
BEGIN
  RETURN left(regexp_replace(regexp_replace(left(regexp_replace(left(body, 4000), '^---.*?\n---\s*', ''), n * 4), '[#>*_`\[\]]+', '', 'g'), '\s+', ' ', 'g'), n);
END
$$;--> statement-breakpoint
-- Búsqueda de texto completo en notas: tsvector guardado (antes se recalculaba to_tsvector del cuerpo por cada fila
-- candidata y otra vez para el ranking: ~1,4 s con 5.000 notas). Fuera del esquema Drizzle a propósito (no se lee
-- en los select de la app; lo mantiene Postgres).
ALTER TABLE "note" ADD COLUMN IF NOT EXISTS "body_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('spanish'::regconfig, public.f_unaccent(body_md))) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_body_tsv" ON "note" USING gin ("body_tsv");--> statement-breakpoint
DROP INDEX IF EXISTS "note_body_fts";
