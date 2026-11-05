CREATE TABLE "certificate" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"kind" text DEFAULT 'ssl' NOT NULL,
	"subject" text NOT NULL,
	"expires_on" date,
	"site_id" uuid,
	"client_id" uuid,
	"notes" text,
	"notify_days_before" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_slot" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"site_id" uuid NOT NULL,
	"blueprint_version" integer NOT NULL,
	"page_key" text NOT NULL,
	"section_key" text NOT NULL,
	"slot_key" text NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"assignee_type" text DEFAULT 'user' NOT NULL,
	"assignee_id" text,
	"body_md" text,
	"file_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	CONSTRAINT "slot_status" CHECK ("content_slot"."status" in ('pending','draft','review','approved','published'))
);
--> statement-breakpoint
CREATE TABLE "credential_ref" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"label" text NOT NULL,
	"vault" text DEFAULT 'bitwarden' NOT NULL,
	"item_path" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "domain" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"client_id" uuid,
	"site_id" uuid,
	"registrar" text,
	"holder" text,
	"expires_on" date,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"dns_ref" text,
	"credential_ref_id" uuid,
	"notify_days_before" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosting" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"provider" text NOT NULL,
	"plan" text,
	"client_id" uuid,
	"expires_on" date,
	"location" text,
	"credential_ref_id" uuid,
	"notify_days_before" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"product_id" uuid NOT NULL,
	"version_id" uuid,
	"site_id" uuid,
	"client_id" uuid,
	"config_ref_md" text,
	"installed_at" date,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "launch_check" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"site_id" uuid NOT NULL,
	"area" text NOT NULL,
	"item" text NOT NULL,
	"owner_type" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"evidence_md" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "own_product" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"kind" text DEFAULT 'wp_plugin' NOT NULL,
	"description" text,
	"repository_id" uuid
);
--> statement-breakpoint
CREATE TABLE "own_product_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"product_id" uuid NOT NULL,
	"version" text NOT NULL,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changelog_md" text,
	"artifact_file_id" uuid
);
--> statement-breakpoint
CREATE TABLE "revision_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"round_id" uuid NOT NULL,
	"page_ref" text,
	"description" text NOT NULL,
	"screenshot_file_id" uuid,
	"priority" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee" text
);
--> statement-breakpoint
CREATE TABLE "revision_round" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"site_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "site" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"client_id" uuid,
	"project_id" uuid,
	"name" text NOT NULL,
	"kind" text DEFAULT 'institutional' NOT NULL,
	"stack" text DEFAULT 'wordpress' NOT NULL,
	"publication_status" text DEFAULT 'building' NOT NULL,
	"prod_url" text,
	"staging_url" text,
	"docs_note_id" uuid,
	"notes_md" text,
	"monitor_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "site_kind" CHECK ("site"."kind" in ('institutional','landing','store','catalog','b2b','blog','app')),
	CONSTRAINT "site_pub" CHECK ("site"."publication_status" in ('building','staging','ready','live','maintenance'))
);
--> statement-breakpoint
CREATE TABLE "site_blueprint" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"site_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"tree" jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_brief" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"site_id" uuid NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"questions_for_client" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_environment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"site_id" uuid NOT NULL,
	"kind" text DEFAULT 'prod' NOT NULL,
	"url" text NOT NULL,
	"hosting_id" uuid,
	"php_version" text,
	"wp_version" text,
	"last_seen_at" timestamp with time zone,
	"last_status" text,
	"last_checked_at" timestamp with time zone,
	"ssl_expires_on" date,
	"ssl_issuer" text,
	"integration_id" uuid
);
--> statement-breakpoint
CREATE TABLE "site_requirement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"site_id" uuid NOT NULL,
	"title" text NOT NULL,
	"moscow" text DEFAULT 'must' NOT NULL,
	"acceptance_md" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uptime_check" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"site_environment_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_code" integer,
	"ok" boolean NOT NULL,
	"latency_ms" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "brand_kit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"client_id" uuid NOT NULL,
	"colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fonts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"logo_file_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"guidelines_file_id" uuid,
	"notes_md" text
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"folder_id" uuid,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"kind" text DEFAULT 'other' NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"site_id" uuid,
	"description" text,
	"origin" text DEFAULT 'upload' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"thumb_key" text,
	"url" text
);
--> statement-breakpoint
CREATE TABLE "file_attachment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_key" text NOT NULL,
	"size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folder" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"parent_id" uuid,
	"name" text NOT NULL,
	"client_id" uuid,
	"project_id" uuid
);
--> statement-breakpoint
CREATE TABLE "reusable_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"kind" text DEFAULT 'document' NOT NULL,
	"name" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"vars" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"site_id" uuid,
	"root_url" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"score" integer,
	"score_formula_version" text,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"report_file_id" uuid,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "seo_field_metrics" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"url_or_origin" text NOT NULL,
	"form_factor" text NOT NULL,
	"lcp_p75" integer,
	"inp_p75" integer,
	"cls_p75" numeric(6, 3),
	"has_data" boolean DEFAULT false NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_issue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"code" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"url" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"task_id" uuid
);
--> statement-breakpoint
CREATE TABLE "seo_lighthouse" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"url" text NOT NULL,
	"strategy" text NOT NULL,
	"performance" integer,
	"accessibility" integer,
	"best_practices" integer,
	"seo" integer,
	"lab_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"from_url" text NOT NULL,
	"to_url" text NOT NULL,
	"internal" boolean NOT NULL,
	"status_code" integer,
	"anchor" text,
	"nofollow" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_page" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"url" text NOT NULL,
	"status_code" integer,
	"redirect_to" text,
	"title" text,
	"meta_description" text,
	"h1" text[],
	"canonical" text,
	"robots_meta" text,
	"indexable" boolean,
	"depth" integer,
	"word_count" integer,
	"size_bytes" integer,
	"ttfb_ms" integer,
	"structured_data" jsonb,
	"og" jsonb
);
--> statement-breakpoint
CREATE TABLE "seo_schedule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"site_id" uuid,
	"root_url" text NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"next_run_on" text
);
--> statement-breakpoint
CREATE TABLE "agent" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"model_provider" text DEFAULT 'anthropic' NOT NULL,
	"model_id" text,
	"fallback_model" text,
	"system_prompt_version" text DEFAULT '1' NOT NULL,
	"tools" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"permission_level" text DEFAULT 'propose' NOT NULL,
	"max_steps" integer DEFAULT 12 NOT NULL,
	"timeout_s" integer DEFAULT 120 NOT NULL,
	"budget_per_run_usd" numeric(10, 4) DEFAULT '0.20' NOT NULL,
	"monthly_budget_usd" numeric(10, 2) DEFAULT '2' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid,
	"agent_key" text NOT NULL,
	"trigger" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"output_md" text,
	"output_entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"model_used" text,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"parent_run_id" uuid,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "agent_step" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"kind" text NOT NULL,
	"tool_name" text,
	"input" jsonb,
	"output" jsonb,
	"latency_ms" integer,
	"tokens" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_provider_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"provider" text NOT NULL,
	"default_model" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"monthly_budget_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"integration_id" uuid
);
--> statement-breakpoint
CREATE TABLE "automation_rule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"trigger_kind" text DEFAULT 'event' NOT NULL,
	"event_type" text,
	"cron" text,
	"conditions" jsonb DEFAULT '{"match":"all","items":[]}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"test_mode" boolean DEFAULT false NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"template_key" text,
	"last_run_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "automation_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"event_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"resume_at" timestamp with time zone,
	CONSTRAINT "automation_run_status" CHECK ("automation_run"."status" in ('running','succeeded','failed','skipped','waiting_approval','waiting'))
);
--> statement-breakpoint
CREATE TABLE "integration" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"provider" text NOT NULL,
	"name" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_enc" "bytea",
	"status" text DEFAULT 'active' NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_id" uuid,
	"status_code" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"response_excerpt" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"direction" text NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"secret_enc" "bytea",
	"events" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_installation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"installation_id" bigint NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text DEFAULT 'User' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "repo_check" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"check_key" text NOT NULL,
	"status" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repository_id" uuid,
	"kind" text NOT NULL,
	"payload_excerpt" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivery_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_plan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_type" text DEFAULT 'user' NOT NULL,
	"created_by_id" text,
	"summary_md" text,
	"approved_at" timestamp with time zone,
	"approved_by" text
);
--> statement-breakpoint
CREATE TABLE "repo_plan_action" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"plan_id" uuid NOT NULL,
	"repository_id" uuid,
	"kind" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"risk" text DEFAULT 'low' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "repository" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"github_id" bigint NOT NULL,
	"installation_id" bigint,
	"full_name" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"private" boolean DEFAULT true NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"topics" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"pushed_at" timestamp with time zone,
	"language" text,
	"scope" text,
	"client_id" uuid,
	"project_id" uuid,
	"product_id" uuid,
	"health_score" integer,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crm_stage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"probability" integer DEFAULT 10 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"client_id" uuid,
	"project_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "note_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preference" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_service" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"service_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_member" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_ok_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quote_decision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"signer_name" text NOT NULL,
	"comment" text,
	"ip" text,
	"user_agent" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_view" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"user_id" text NOT NULL,
	"module" text NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"project_id" uuid,
	"task_id" uuid,
	"user_id" text NOT NULL,
	"minutes" integer NOT NULL,
	"date" date NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"rate" numeric(14, 2),
	"currency" text DEFAULT 'ARS' NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "weekly_review" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"user_id" text NOT NULL,
	"week" text NOT NULL,
	"completed_at" timestamp with time zone,
	"note_id" uuid,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "public_token_hash" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "public_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "slot_site" ON "content_slot" USING btree ("site_id","page_key");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_ws_name" ON "domain" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "site_ws" ON "site" USING btree ("workspace_id","publication_status");--> statement-breakpoint
CREATE UNIQUE INDEX "blueprint_site_version" ON "site_blueprint" USING btree ("site_id","version");--> statement-breakpoint
CREATE INDEX "uptime_env_time" ON "uptime_check" USING btree ("site_environment_id","checked_at");--> statement-breakpoint
CREATE INDEX "file_ws" ON "file" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "file_client" ON "file" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "attachment_entity" ON "file_attachment" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "seo_audit_ws" ON "seo_audit" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "seo_issue_audit" ON "seo_issue" USING btree ("audit_id","severity");--> statement-breakpoint
CREATE INDEX "seo_link_audit" ON "seo_link" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "seo_page_audit" ON "seo_page" USING btree ("audit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_ws_key" ON "agent" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "agent_run_ws" ON "agent_run" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_step_run" ON "agent_step" USING btree ("run_id","index");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_run_idem" ON "automation_run" USING btree ("rule_id","event_id");--> statement-breakpoint
CREATE INDEX "automation_run_rule" ON "automation_run" USING btree ("rule_id","started_at");--> statement-breakpoint
CREATE INDEX "integration_ws_provider" ON "integration" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "gh_installation_ws" ON "github_installation" USING btree ("workspace_id","installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_check_key" ON "repo_check" USING btree ("repository_id","check_key");--> statement-breakpoint
CREATE INDEX "repo_event_repo" ON "repo_event" USING btree ("repository_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_event_delivery" ON "repo_event" USING btree ("delivery_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_ws_github" ON "repository" USING btree ("workspace_id","github_id");--> statement-breakpoint
CREATE INDEX "repository_project" ON "repository" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_pref_unique" ON "notification_preference" USING btree ("user_id","event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_service_unique" ON "opportunity_service" USING btree ("opportunity_id","service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_member_unique" ON "project_member" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_endpoint" ON "push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "time_entry_project" ON "time_entry" USING btree ("project_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_review_week" ON "weekly_review" USING btree ("workspace_id","user_id","week");