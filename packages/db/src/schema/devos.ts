import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns, pk, tz } from "./_common";

/** Sistema operativo de desarrollo (ADR 0015): skills, objetivos del agente, sus pasos y su bitácora. */

export const skill = pgTable(
  "skill",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull(),
    instructionsMd: text("instructions_md").notNull(),
    tools: text("tools").array().notNull().default(sql`ARRAY[]::text[]`),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
  },
  (t) => [uniqueIndex("skill_ws_slug").on(t.workspaceId, t.slug)],
);

export const goal = pgTable(
  "goal",
  {
    ...baseColumns(),
    title: text("title").notNull(),
    descriptionMd: text("description_md").notNull().default(""),
    acceptanceMd: text("acceptance_md").notNull().default(""),
    projectId: uuid("project_id"),
    clientId: uuid("client_id"),
    repo: text("repo"),
    skillIds: uuid("skill_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
    status: text("status").notNull().default("draft"),
    priority: integer("priority").notNull().default(3),
    executor: text("executor"),
    summaryMd: text("summary_md"),
    startedAt: tz("started_at"),
    finishedAt: tz("finished_at"),
    lastActivityAt: tz("last_activity_at").notNull().defaultNow(),
  },
  (t) => [
    index("goal_ws_status").on(t.workspaceId, t.status),
    check("goal_status", sql`${t.status} in ('draft','planned','approved','running','blocked','review','done','failed','cancelled')`),
  ],
);

export const goalStep = pgTable(
  "goal_step",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    goalId: uuid("goal_id").notNull(),
    idx: integer("idx").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("task"),
    detailMd: text("detail_md"),
    status: text("status").notNull().default("pending"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    approvedAt: tz("approved_at"),
    attempts: integer("attempts").notNull().default(0),
    resultMd: text("result_md"),
    taskId: uuid("task_id"),
  },
  (t) => [
    uniqueIndex("goal_step_idx").on(t.goalId, t.idx),
    check("goal_step_status", sql`${t.status} in ('pending','running','done','failed','skipped','waiting_approval')`),
  ],
);

export const goalEvent = pgTable(
  "goal_event",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    goalId: uuid("goal_id").notNull(),
    at: tz("at").notNull().defaultNow(),
    actorType: text("actor_type").notNull(),
    actorName: text("actor_name"),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("goal_event_goal").on(t.goalId, t.at)],
);
