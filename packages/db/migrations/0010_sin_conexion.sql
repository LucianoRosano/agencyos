CREATE TABLE "sync_mutation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"entity_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	CONSTRAINT "sync_mutation_status" CHECK ("sync_mutation"."status" in ('pending','applied','conflict','rejected'))
);
--> statement-breakpoint
CREATE INDEX "sync_mutation_user" ON "sync_mutation" USING btree ("user_id","created_at");