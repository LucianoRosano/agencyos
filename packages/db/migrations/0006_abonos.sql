CREATE TABLE "retainer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"concept" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"hours_included" numeric(6, 2),
	"billing_day" integer DEFAULT 1 NOT NULL,
	"due_days" integer DEFAULT 10 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"next_issue_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes_md" text,
	CONSTRAINT "retainer_status" CHECK ("retainer"."status" in ('active','paused','cancelled')),
	CONSTRAINT "retainer_day" CHECK ("retainer"."billing_day" between 1 and 28)
);
--> statement-breakpoint
CREATE INDEX "retainer_due" ON "retainer" USING btree ("workspace_id","status","next_issue_date");--> statement-breakpoint
CREATE INDEX "retainer_client" ON "retainer" USING btree ("workspace_id","client_id");