import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns, pk, tz } from "./_common";

export const workspace = pgTable("workspace", {
  id: pk(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  defaultCurrency: text("default_currency").notNull().default("ARS"),
  enabledCurrencies: text("enabled_currencies").array().notNull().default(sql`ARRAY['ARS','USD']`),
  timezone: text("timezone").notNull().default("America/Buenos_Aires"),
  /** Datos de la agencia para PDFs, numeración, etc. */
  settings: jsonb("settings").$type<WorkspaceSettings>().notNull().default({}),
  enabledModules: text("enabled_modules").array().notNull().default(sql`ARRAY[]::text[]`),
  quoteSeq: jsonb("quote_seq").$type<Record<string, number>>().notNull().default({}),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export type WorkspaceSettings = {
  agencyName?: string;
  agencyEmail?: string;
  agencyPhone?: string;
  agencyWebsite?: string;
  agencyCity?: string;
  quoteFooter?: string;
  stalledDays?: number;
  maxActiveProjects?: number;
};

export const membership = pgTable(
  "membership",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("owner"),
    status: text("status").notNull().default("active"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("membership_ws_user").on(t.workspaceId, t.userId), check("membership_role", sql`${t.role} in ('owner','admin','member','client')`)],
);

export const space = pgTable(
  "space",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#7C5CFF"),
    icon: text("icon"),
    kind: text("kind").notNull().default("custom"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("space_ws").on(t.workspaceId), check("space_kind", sql`${t.kind} in ('agency','personal','study','custom')`)],
);

export const tag = pgTable(
  "tag",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#8A93A6"),
  },
  (t) => [uniqueIndex("tag_ws_name").on(t.workspaceId, t.name)],
);

export const tagging = pgTable(
  "tagging",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
  },
  (t) => [uniqueIndex("tagging_unique").on(t.tagId, t.entityType, t.entityId), index("tagging_entity").on(t.entityType, t.entityId)],
);

export const link = pgTable(
  "link",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    fromType: text("from_type").notNull(),
    fromId: uuid("from_id").notNull(),
    toType: text("to_type").notNull(),
    toId: uuid("to_id").notNull(),
    kind: text("kind").notNull().default("related"),
    createdAt: tz("created_at").notNull().defaultNow(),
    createdBy: text("created_by"),
  },
  (t) => [
    index("link_from").on(t.fromType, t.fromId),
    index("link_to").on(t.toType, t.toId),
    uniqueIndex("link_unique").on(t.workspaceId, t.fromType, t.fromId, t.toType, t.toId, t.kind),
  ],
);

export const comment = pgTable(
  "comment",
  {
    ...baseColumns(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    bodyMd: text("body_md").notNull(),
    authorId: text("author_id"),
    parentId: uuid("parent_id"),
  },
  (t) => [index("comment_entity").on(t.entityType, t.entityId)],
);

export const userPreference = pgTable(
  "user_preference",
  {
    id: pk(),
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_pref_key").on(t.userId, t.key)],
);

export const domainEvent = pgTable(
  "domain_event",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    type: text("type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: tz("occurred_at").notNull().defaultNow(),
    dispatchedAt: tz("dispatched_at"),
  },
  (t) => [index("domain_event_pending").on(t.occurredAt).where(sql`${t.dispatchedAt} is null`)],
);

export const activity = pgTable(
  "activity",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    verb: text("verb").notNull(),
    summary: text("summary").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    meta: jsonb("meta").notNull().default({}),
    occurredAt: tz("occurred_at").notNull().defaultNow(),
  },
  (t) => [index("activity_entity").on(t.entityType, t.entityId, t.occurredAt), index("activity_ws_time").on(t.workspaceId, t.occurredAt)],
);

export const notification = pgTable(
  "notification",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    dedupeKey: text("dedupe_key"),
    readAt: tz("read_at"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("notification_user").on(t.userId, t.createdAt), uniqueIndex("notification_dedupe").on(t.userId, t.dedupeKey)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: pk(),
    workspaceId: uuid("workspace_id"),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    before: jsonb("before"),
    after: jsonb("after"),
    at: tz("at").notNull().defaultNow(),
  },
  (t) => [index("audit_ws_at").on(t.workspaceId, t.at)],
);

export const approval = pgTable(
  "approval",
  {
    ...baseColumns(),
    kind: text("kind").notNull(),
    requestedByType: text("requested_by_type").notNull(),
    requestedById: text("requested_by_id"),
    title: text("title").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    proposal: jsonb("proposal").notNull().default({}),
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by"),
    decidedAt: tz("decided_at"),
    executionResult: jsonb("execution_result"),
  },
  (t) => [index("approval_status").on(t.workspaceId, t.status)],
);

export const inboxItem = pgTable(
  "inbox_item",
  {
    ...baseColumns(),
    text: text("text").notNull(),
    suggestedType: text("suggested_type"),
    source: text("source").notNull().default("app"),
    spaceId: uuid("space_id"),
    processedAt: tz("processed_at"),
    resultEntityType: text("result_entity_type"),
    resultEntityId: uuid("result_entity_id"),
  },
  (t) => [index("inbox_pending").on(t.workspaceId, t.createdAt).where(sql`${t.processedAt} is null and ${t.deletedAt} is null`)],
);

export const mcpToken = pgTable("mcp_token", {
  ...baseColumns(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  scopes: text("scopes").array().notNull(),
  userId: text("user_id").notNull(),
  lastUsedAt: tz("last_used_at"),
  expiresAt: tz("expires_at"),
  revokedAt: tz("revoked_at"),
});

/** Recordatorios con fecha sueltos (renovaciones, vencimientos) hasta que exista Activos técnicos (F2). */
export const reminder = pgTable(
  "reminder",
  {
    ...baseColumns(),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("other"),
    dueDate: date("due_date").notNull(),
    notifyDaysBefore: integer("notify_days_before").notNull().default(30),
    spaceId: uuid("space_id"),
    clientId: uuid("client_id"),
    notesMd: text("notes_md"),
    doneAt: tz("done_at"),
    recurring: boolean("recurring").notNull().default(false),
  },
  (t) => [index("reminder_due").on(t.workspaceId, t.dueDate)],
);
