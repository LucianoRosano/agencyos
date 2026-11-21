CREATE TABLE "knowledge_chunk" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"chunk" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"href" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_source" (
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"chunks" integer DEFAULT 0 NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_source_source_type_source_id_pk" PRIMARY KEY("source_type","source_id")
);
--> statement-breakpoint
CREATE INDEX "knowledge_chunk_source" ON "knowledge_chunk" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunk_ws" ON "knowledge_chunk" USING btree ("workspace_id","source_type");--> statement-breakpoint
CREATE INDEX "knowledge_source_ws" ON "knowledge_source" USING btree ("workspace_id");--> statement-breakpoint
-- Búsqueda de texto completo en español sin acentos (f_search_norm es IMMUTABLE): título con más peso que el cuerpo.
ALTER TABLE "knowledge_chunk" ADD COLUMN "tsv" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('spanish', f_search_norm(coalesce("title", ''))), 'A') || setweight(to_tsvector('spanish', f_search_norm(coalesce("content", ''))), 'B')
) STORED;--> statement-breakpoint
CREATE INDEX "knowledge_chunk_tsv" ON "knowledge_chunk" USING gin ("tsv");
