CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"verb" text NOT NULL,
	"summary" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"kind" text NOT NULL,
	"requested_by_type" text NOT NULL,
	"requested_by_id" text,
	"title" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"proposal" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"execution_result" jsonb
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"ip" text,
	"user_agent" text,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"body_md" text NOT NULL,
	"author_id" text,
	"parent_id" uuid
);
--> statement-breakpoint
CREATE TABLE "domain_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inbox_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"text" text NOT NULL,
	"suggested_type" text,
	"source" text DEFAULT 'app' NOT NULL,
	"space_id" uuid,
	"processed_at" timestamp with time zone,
	"result_entity_type" text,
	"result_entity_id" uuid
);
--> statement-breakpoint
CREATE TABLE "link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"from_type" text NOT NULL,
	"from_id" uuid NOT NULL,
	"to_type" text NOT NULL,
	"to_id" uuid NOT NULL,
	"kind" text DEFAULT 'related' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "mcp_token" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"scopes" text[] NOT NULL,
	"user_id" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "mcp_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_role" CHECK ("membership"."role" in ('owner','admin','member','client'))
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"entity_type" text,
	"entity_id" uuid,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"title" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"due_date" date NOT NULL,
	"notify_days_before" integer DEFAULT 30 NOT NULL,
	"space_id" uuid,
	"client_id" uuid,
	"notes_md" text,
	"done_at" timestamp with time zone,
	"recurring" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"color" text DEFAULT '#7C5CFF' NOT NULL,
	"icon" text,
	"kind" text DEFAULT 'custom' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "space_kind" CHECK ("space"."kind" in ('agency','personal','study','custom'))
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"color" text DEFAULT '#8A93A6' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tagging" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preference" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"default_currency" text DEFAULT 'ARS' NOT NULL,
	"enabled_currencies" text[] DEFAULT ARRAY['ARS','USD'] NOT NULL,
	"timezone" text DEFAULT 'America/Buenos_Aires' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled_modules" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"quote_seq" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"trade_name" text,
	"industry" text,
	"website" text,
	"city" text,
	"province" text,
	"relationship" text DEFAULT 'external' NOT NULL,
	"status" text DEFAULT 'prospect' NOT NULL,
	"source" text,
	"space_id" uuid,
	"notes_md" text,
	"last_activity_at" timestamp with time zone,
	CONSTRAINT "client_status" CHECK ("client"."status" in ('prospect','active','paused','finished','archived')),
	CONSTRAINT "client_rel" CHECK ("client"."relationship" in ('family','referral','external'))
);
--> statement-breakpoint
CREATE TABLE "client_contact" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"role_in_client" text
);
--> statement-breakpoint
CREATE TABLE "client_fiscal_holder" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"client_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"tax_id" text,
	"vat_condition" text,
	"is_default" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"notes_md" text
);
--> statement-breakpoint
CREATE TABLE "interaction" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"client_id" uuid NOT NULL,
	"contact_id" uuid,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"summary_md" text NOT NULL,
	"next_step" text,
	"next_step_due" date,
	CONSTRAINT "interaction_kind" CHECK ("interaction"."kind" in ('whatsapp','call','email','meeting','message','note'))
);
--> statement-breakpoint
CREATE TABLE "opportunity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"value_amount" numeric(14, 2),
	"value_currency" text DEFAULT 'ARS' NOT NULL,
	"probability" integer DEFAULT 10 NOT NULL,
	"expected_close" date,
	"next_action" text,
	"next_action_due" date,
	"lost_reason" text,
	"won_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "opportunity_stage" CHECK ("opportunity"."stage" in ('new','contacted','meeting','proposal_sent','negotiation','won','lost')),
	CONSTRAINT "opportunity_prob" CHECK ("opportunity"."probability" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "blocker" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"project_id" uuid NOT NULL,
	"waiting_for" text NOT NULL,
	"revisit_on" date,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "changelog_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"project_id" uuid NOT NULL,
	"kind" text DEFAULT 'auto' NOT NULL,
	"title" text NOT NULL,
	"body_md" text,
	"version" text
);
--> statement-breakpoint
CREATE TABLE "decision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"rationale_md" text,
	"decided_on" date NOT NULL,
	"approved_by" text
);
--> statement-breakpoint
CREATE TABLE "deliverable" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content_md" text,
	"due_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_contact_id" uuid,
	CONSTRAINT "deliverable_status" CHECK ("deliverable"."status" in ('pending','delivered','approved','changes_requested'))
);
--> statement-breakpoint
CREATE TABLE "focus_pick" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"task_id" uuid NOT NULL,
	"slot" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "focus_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"task_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"minutes" integer,
	"notes_md" text
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"space_id" uuid NOT NULL,
	"client_id" uuid,
	"kind" text DEFAULT 'other' NOT NULL,
	"goal" text,
	"definition_of_done" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"start_date" date,
	"target_date" date,
	"delivered_date" date,
	"next_action" text,
	"owner_id" text,
	"template_id" uuid,
	"quote_id" uuid,
	"notes_md" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_status" CHECK ("project"."status" in ('idea','planning','in_progress','paused','blocked','done','archived')),
	CONSTRAINT "project_kind" CHECK ("project"."kind" in ('website','store','panel','seo','maintenance','personal','study','other')),
	CONSTRAINT "project_next_action" CHECK ("project"."status" <> 'in_progress' or ("project"."next_action" is not null and length(trim("project"."next_action")) > 0))
);
--> statement-breakpoint
CREATE TABLE "project_phase" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" date
);
--> statement-breakpoint
CREATE TABLE "project_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"key" text,
	"name" text NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"description" text,
	"definition" jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"title" text NOT NULL,
	"description_md" text,
	"space_id" uuid NOT NULL,
	"project_id" uuid,
	"phase_id" uuid,
	"parent_task_id" uuid,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"due_date" date,
	"due_time" text,
	"rrule" text,
	"estimate_minutes" integer,
	"assignee_type" text DEFAULT 'user' NOT NULL,
	"assignee_id" text,
	"completed_at" timestamp with time zone,
	"snoozed_from" date,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "task_status" CHECK ("task"."status" in ('todo','doing','waiting','done','cancelled')),
	CONSTRAINT "task_priority" CHECK ("task"."priority" between 1 and 4),
	CONSTRAINT "task_assignee" CHECK ("task"."assignee_type" in ('user','agent','client'))
);
--> statement-breakpoint
CREATE TABLE "task_checklist_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"number" text NOT NULL,
	"client_id" uuid NOT NULL,
	"contact_id" uuid,
	"opportunity_id" uuid,
	"title" text NOT NULL,
	"current_version_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"project_id" uuid,
	CONSTRAINT "quote_status" CHECK ("quote"."status" in ('draft','sent','viewed','accepted','rejected','expired','void'))
);
--> statement-breakpoint
CREATE TABLE "quote_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"quote_version_id" uuid NOT NULL,
	"service_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(12, 2) DEFAULT '1' NOT NULL,
	"unit" text,
	"unit_price" numeric(14, 2) NOT NULL,
	"discount_type" text DEFAULT 'none' NOT NULL,
	"discount_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"intro_md" text,
	"scope_md" text,
	"exclusions_md" text,
	"terms_md" text,
	"default_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_valid_days" integer DEFAULT 15 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"quote_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"currency" text NOT NULL,
	"exchange_rate_ref" numeric(14, 4),
	"issue_date" date NOT NULL,
	"valid_until" date NOT NULL,
	"intro_md" text,
	"scope_md" text,
	"exclusions_md" text,
	"terms_md" text,
	"payment_plan" jsonb DEFAULT '{"kind":"single"}'::jsonb NOT NULL,
	"global_discount_type" text DEFAULT 'none' NOT NULL,
	"global_discount_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"discount_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes_md" text,
	"locked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"description_md" text,
	"deliverables_md" text,
	"unit" text DEFAULT 'project' NOT NULL,
	"price_ars" numeric(14, 2),
	"price_usd" numeric(14, 2),
	"project_template_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "service_unit" CHECK ("service"."unit" in ('project','hour','month','page','product','item'))
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"ledger_id" uuid,
	"parent_id" uuid,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "category_kind" CHECK ("category"."kind" in ('income','expense'))
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"space_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"ledger_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'cash' NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"opening_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"opening_date" date NOT NULL,
	CONSTRAINT "account_kind" CHECK ("money_account"."kind" in ('cash','bank','wallet','usd','other'))
);
--> statement-breakpoint
CREATE TABLE "payable" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"ledger_id" uuid NOT NULL,
	"counterpart" text NOT NULL,
	"concept" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"due_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "payable_status" CHECK ("payable"."status" in ('pending','partial','paid','overdue','void'))
);
--> statement-breakpoint
CREATE TABLE "receivable" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"quote_id" uuid,
	"concept" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"due_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "receivable_status" CHECK ("receivable"."status" in ('pending','partial','paid','overdue','void'))
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"ledger_id" uuid NOT NULL,
	"vendor" text NOT NULL,
	"description" text,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"next_due" date NOT NULL,
	"account_id" uuid,
	"category_id" uuid,
	"notify_days_before" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "subscription_freq" CHECK ("subscription"."frequency" in ('weekly','monthly','yearly')),
	CONSTRAINT "subscription_status" CHECK ("subscription"."status" in ('active','paused','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"ledger_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"exchange_rate" numeric(14, 4),
	"rate_base_currency" text,
	"category_id" uuid,
	"client_id" uuid,
	"project_id" uuid,
	"counterpart" text,
	"description" text,
	"transfer_pair_id" uuid,
	"receivable_id" uuid,
	"payable_id" uuid,
	"subscription_id" uuid,
	CONSTRAINT "transaction_kind" CHECK ("transaction"."kind" in ('income','expense','transfer_in','transfer_out')),
	CONSTRAINT "transaction_amount_pos" CHECK ("transaction"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "assessment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"course_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"date" date NOT NULL,
	"time" text,
	"topics_md" text,
	"target_grade" numeric(4, 2),
	"grade" numeric(4, 2),
	CONSTRAINT "assessment_kind" CHECK ("assessment"."kind" in ('parcial','tp','final','recuperatorio','otro'))
);
--> statement-breakpoint
CREATE TABLE "course" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"program" text,
	"term" text,
	"commission" text,
	"teachers" text,
	"schedule" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'cursando' NOT NULL,
	"final_grade" numeric(4, 2),
	"space_id" uuid,
	"color" text,
	"notes_md" text,
	CONSTRAINT "course_status" CHECK ("course"."status" in ('cursando','regular','aprobada','final_pendiente','abandonada'))
);
--> statement-breakpoint
CREATE TABLE "graph_layout" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"view_key" text NOT NULL,
	"positions" jsonb NOT NULL,
	"node_count" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"space_id" uuid,
	"folder_path" text,
	"body_md" text DEFAULT '' NOT NULL,
	"frontmatter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_daily" boolean DEFAULT false NOT NULL,
	"daily_date" date,
	"aliases" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"pinned" boolean DEFAULT false NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"last_opened_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "note_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_entity" ON "activity" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_ws_time" ON "activity" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "approval_status" ON "approval" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "audit_ws_at" ON "audit_log" USING btree ("workspace_id","at");--> statement-breakpoint
CREATE INDEX "comment_entity" ON "comment" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "domain_event_pending" ON "domain_event" USING btree ("occurred_at") WHERE "domain_event"."dispatched_at" is null;--> statement-breakpoint
CREATE INDEX "inbox_pending" ON "inbox_item" USING btree ("workspace_id","created_at") WHERE "inbox_item"."processed_at" is null and "inbox_item"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "link_from" ON "link" USING btree ("from_type","from_id");--> statement-breakpoint
CREATE INDEX "link_to" ON "link" USING btree ("to_type","to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "link_unique" ON "link" USING btree ("workspace_id","from_type","from_id","to_type","to_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_ws_user" ON "membership" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "notification_user" ON "notification" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_dedupe" ON "notification" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "reminder_due" ON "reminder" USING btree ("workspace_id","due_date");--> statement-breakpoint
CREATE INDEX "space_ws" ON "space" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_ws_name" ON "tag" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tagging_unique" ON "tagging" USING btree ("tag_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "tagging_entity" ON "tagging" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_pref_key" ON "user_preference" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "client_ws" ON "client" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "client_contact_client" ON "client_contact" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_contact_contact" ON "client_contact" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_ws" ON "contact" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "interaction_client" ON "interaction" USING btree ("client_id","occurred_at");--> statement-breakpoint
CREATE INDEX "opportunity_ws_stage" ON "opportunity" USING btree ("workspace_id","stage");--> statement-breakpoint
CREATE INDEX "blocker_project" ON "blocker" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "changelog_project" ON "changelog_entry" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "decision_project" ON "decision" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "deliverable_project" ON "deliverable" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "focus_pick_slot" ON "focus_pick" USING btree ("user_id","date","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "focus_pick_task" ON "focus_pick" USING btree ("user_id","date","task_id");--> statement-breakpoint
CREATE INDEX "project_ws_status" ON "project" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "project_client" ON "project" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "phase_project" ON "project_phase" USING btree ("project_id","sort");--> statement-breakpoint
CREATE INDEX "task_ws_status_due" ON "task" USING btree ("workspace_id","status","due_date");--> statement-breakpoint
CREATE INDEX "task_project" ON "task" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "task_parent" ON "task" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "checklist_task" ON "task_checklist_item" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_number" ON "quote" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE INDEX "quote_ws_status" ON "quote" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "quote_item_version" ON "quote_item" USING btree ("quote_version_id","sort");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_version_unique" ON "quote_version" USING btree ("quote_id","version");--> statement-breakpoint
CREATE INDEX "payable_ws_due" ON "payable" USING btree ("workspace_id","status","due_date");--> statement-breakpoint
CREATE INDEX "receivable_ws_due" ON "receivable" USING btree ("workspace_id","status","due_date");--> statement-breakpoint
CREATE INDEX "subscription_due" ON "subscription" USING btree ("workspace_id","next_due");--> statement-breakpoint
CREATE INDEX "transaction_ws_date" ON "transaction" USING btree ("workspace_id","date");--> statement-breakpoint
CREATE INDEX "transaction_account" ON "transaction" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "assessment_course" ON "assessment" USING btree ("course_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "graph_layout_key" ON "graph_layout" USING btree ("workspace_id","view_key");--> statement-breakpoint
CREATE INDEX "note_ws_updated" ON "note" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "note_ws_slug" ON "note" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "note_entity" ON "note" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "note_version_note" ON "note_version" USING btree ("note_id","created_at");