CREATE TABLE "goal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"title" text NOT NULL,
	"description_md" text DEFAULT '' NOT NULL,
	"acceptance_md" text DEFAULT '' NOT NULL,
	"project_id" uuid,
	"client_id" uuid,
	"repo" text,
	"skill_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"executor" text,
	"summary_md" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_status" CHECK ("goal"."status" in ('draft','planned','approved','running','blocked','review','done','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "goal_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_name" text,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_step" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'task' NOT NULL,
	"detail_md" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"result_md" text,
	"task_id" uuid,
	CONSTRAINT "goal_step_status" CHECK ("goal_step"."status" in ('pending','running','done','failed','skipped','waiting_approval'))
);
--> statement-breakpoint
CREATE TABLE "skill" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"instructions_md" text NOT NULL,
	"tools" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "goal_ws_status" ON "goal" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "goal_event_goal" ON "goal_event" USING btree ("goal_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "goal_step_idx" ON "goal_step" USING btree ("goal_id","idx");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_ws_slug" ON "skill" USING btree ("workspace_id","slug");