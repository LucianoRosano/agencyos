CREATE TABLE "client_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"project_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"score" integer NOT NULL,
	"comment" text,
	CONSTRAINT "client_feedback_score" CHECK ("client_feedback"."score" between 0 and 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "client_feedback_project_user" ON "client_feedback" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "client_feedback_client" ON "client_feedback" USING btree ("workspace_id","client_id");