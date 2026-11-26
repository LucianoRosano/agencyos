DROP INDEX "notification_unread";--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "push_state" text;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "snoozed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notification_snoozed" ON "notification" USING btree ("snoozed_until") WHERE "notification"."snoozed_until" is not null;--> statement-breakpoint
CREATE INDEX "notification_deferred" ON "notification" USING btree ("user_id") WHERE "notification"."push_state" = 'deferred';--> statement-breakpoint
CREATE INDEX "notification_unread" ON "notification" USING btree ("user_id","workspace_id") WHERE "notification"."read_at" is null and "notification"."archived_at" is null;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_priority" CHECK ("notification"."priority" in ('urgent','normal','low'));