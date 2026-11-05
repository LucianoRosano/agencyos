import { sql } from "drizzle-orm";
import { boolean, check, customType, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns, pk, tz } from "./_common";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

// --- Integraciones con secretos cifrados (docs/08 §4) ---
export const integration = pgTable(
  "integration",
  {
    ...baseColumns(),
    provider: text("provider").notNull(),
    name: text("name"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    secretEnc: bytea("secret_enc"),
    status: text("status").notNull().default("active"),
    lastOkAt: tz("last_ok_at"),
    lastError: text("last_error"),
  },
  (t) => [index("integration_ws_provider").on(t.workspaceId, t.provider)],
);

// --- Centro de automatizaciones (M09, docs/04 §11) ---
export type AutomationCondition = { field: string; op: "eq" | "neq" | "contains" | "gt" | "lt" | "exists"; value?: string };
export type AutomationAction = { type: string; params: Record<string, unknown> };

export const automationRule = pgTable("automation_rule", {
  ...baseColumns(),
  name: text("name").notNull(),
  triggerKind: text("trigger_kind").notNull().default("event"),
  eventType: text("event_type"),
  cron: text("cron"),
  conditions: jsonb("conditions").$type<{ match: "all" | "any"; items: AutomationCondition[] }>().notNull().default({ match: "all", items: [] }),
  actions: jsonb("actions").$type<AutomationAction[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  testMode: boolean("test_mode").notNull().default(false),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  templateKey: text("template_key"),
  lastRunAt: tz("last_run_at"),
});

export const automationRun = pgTable(
  "automation_run",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    ruleId: uuid("rule_id").notNull(),
    eventId: uuid("event_id"),
    status: text("status").notNull().default("running"),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output").notNull().default({}),
    error: text("error"),
    attempt: integer("attempt").notNull().default(1),
    dryRun: boolean("dry_run").notNull().default(false),
    startedAt: tz("started_at").notNull().defaultNow(),
    finishedAt: tz("finished_at"),
    resumeAt: tz("resume_at"),
  },
  (t) => [
    uniqueIndex("automation_run_idem").on(t.ruleId, t.eventId),
    index("automation_run_rule").on(t.ruleId, t.startedAt),
    check("automation_run_status", sql`${t.status} in ('running','succeeded','failed','skipped','waiting_approval','waiting')`),
  ],
);

export const webhookEndpoint = pgTable("webhook_endpoint", {
  ...baseColumns(),
  direction: text("direction").notNull(),
  name: text("name").notNull(),
  url: text("url"),
  secretEnc: bytea("secret_enc"),
  events: text("events").array().notNull().default(sql`ARRAY[]::text[]`),
  active: boolean("active").notNull().default(true),
});

export const webhookDelivery = pgTable("webhook_delivery", {
  id: pk(),
  workspaceId: uuid("workspace_id").notNull(),
  endpointId: uuid("endpoint_id").notNull(),
  eventId: uuid("event_id"),
  statusCode: integer("status_code"),
  attempt: integer("attempt").notNull().default(1),
  responseExcerpt: text("response_excerpt"),
  at: tz("at").notNull().defaultNow(),
});

// --- IA (M10, docs/04 §12) ---
export const aiProviderConfig = pgTable("ai_provider_config", {
  ...baseColumns(),
  provider: text("provider").notNull(),
  defaultModel: text("default_model"),
  enabled: boolean("enabled").notNull().default(false),
  monthlyBudgetUsd: numeric("monthly_budget_usd", { precision: 10, scale: 2 }).notNull().default("0"),
  integrationId: uuid("integration_id"),
});

export const agent = pgTable(
  "agent",
  {
    ...baseColumns(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    modelProvider: text("model_provider").notNull().default("anthropic"),
    modelId: text("model_id"),
    fallbackModel: text("fallback_model"),
    systemPromptVersion: text("system_prompt_version").notNull().default("1"),
    tools: text("tools").array().notNull().default(sql`ARRAY[]::text[]`),
    permissionLevel: text("permission_level").notNull().default("propose"),
    maxSteps: integer("max_steps").notNull().default(12),
    timeoutS: integer("timeout_s").notNull().default(120),
    budgetPerRunUsd: numeric("budget_per_run_usd", { precision: 10, scale: 4 }).notNull().default("0.20"),
    monthlyBudgetUsd: numeric("monthly_budget_usd", { precision: 10, scale: 2 }).notNull().default("2"),
  },
  (t) => [uniqueIndex("agent_ws_key").on(t.workspaceId, t.key)],
);

export const agentRun = pgTable(
  "agent_run",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    agentId: uuid("agent_id"),
    agentKey: text("agent_key").notNull(),
    trigger: text("trigger").notNull(),
    input: jsonb("input").notNull().default({}),
    status: text("status").notNull().default("queued"),
    outputMd: text("output_md"),
    outputEntities: jsonb("output_entities").notNull().default([]),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    modelUsed: text("model_used"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: tz("started_at").notNull().defaultNow(),
    finishedAt: tz("finished_at"),
    parentRunId: uuid("parent_run_id"),
    createdBy: text("created_by"),
  },
  (t) => [index("agent_run_ws").on(t.workspaceId, t.startedAt)],
);

export const agentStep = pgTable(
  "agent_step",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    runId: uuid("run_id").notNull(),
    index: integer("index").notNull(),
    kind: text("kind").notNull(),
    toolName: text("tool_name"),
    input: jsonb("input"),
    output: jsonb("output"),
    latencyMs: integer("latency_ms"),
    tokens: integer("tokens"),
    error: text("error"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("agent_step_run").on(t.runId, t.index)],
);
