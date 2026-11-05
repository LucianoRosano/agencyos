import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns, pk, tz } from "./_common";

// --- Repositorios (M11, docs/04 §13 y docs/15) ---

export const githubInstallation = pgTable(
  "github_installation",
  {
    ...baseColumns(),
    installationId: bigint("installation_id", { mode: "number" }).notNull(),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").notNull().default("User"),
    permissions: jsonb("permissions").notNull().default({}),
    lastSyncedAt: tz("last_synced_at"),
  },
  (t) => [uniqueIndex("gh_installation_ws").on(t.workspaceId, t.installationId)],
);

export const repository = pgTable(
  "repository",
  {
    ...baseColumns(),
    githubId: bigint("github_id", { mode: "number" }).notNull(),
    installationId: bigint("installation_id", { mode: "number" }),
    fullName: text("full_name").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    private: boolean("private").notNull().default(true),
    defaultBranch: text("default_branch").notNull().default("main"),
    topics: text("topics").array().notNull().default(sql`ARRAY[]::text[]`),
    archived: boolean("archived").notNull().default(false),
    pushedAt: tz("pushed_at"),
    language: text("language"),
    scope: text("scope"),
    clientId: uuid("client_id"),
    projectId: uuid("project_id"),
    productId: uuid("product_id"),
    healthScore: integer("health_score"),
    lastSyncedAt: tz("last_synced_at"),
  },
  (t) => [uniqueIndex("repository_ws_github").on(t.workspaceId, t.githubId), index("repository_project").on(t.projectId)],
);

export const repoCheck = pgTable(
  "repo_check",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    repositoryId: uuid("repository_id").notNull(),
    checkKey: text("check_key").notNull(),
    status: text("status").notNull(),
    details: jsonb("details").notNull().default({}),
    checkedAt: tz("checked_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("repo_check_key").on(t.repositoryId, t.checkKey)],
);

export const repoPlan = pgTable("repo_plan", {
  ...baseColumns(),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  createdByType: text("created_by_type").notNull().default("user"),
  createdById: text("created_by_id"),
  summaryMd: text("summary_md"),
  approvedAt: tz("approved_at"),
  approvedBy: text("approved_by"),
});

export const repoPlanAction = pgTable("repo_plan_action", {
  ...baseColumns(),
  planId: uuid("plan_id").notNull(),
  repositoryId: uuid("repository_id"),
  kind: text("kind").notNull(),
  params: jsonb("params").notNull().default({}),
  risk: text("risk").notNull().default("low"),
  status: text("status").notNull().default("pending"),
  result: jsonb("result"),
  executedAt: tz("executed_at"),
});

export const repoEvent = pgTable(
  "repo_event",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    repositoryId: uuid("repository_id"),
    kind: text("kind").notNull(),
    payloadExcerpt: jsonb("payload_excerpt").notNull().default({}),
    deliveryId: text("delivery_id"),
    at: tz("at").notNull().defaultNow(),
  },
  (t) => [index("repo_event_repo").on(t.repositoryId, t.at), uniqueIndex("repo_event_delivery").on(t.deliveryId)],
);
