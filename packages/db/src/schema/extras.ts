import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns, pk, tz } from "./_common";

// --- Núcleo transversal y extras de F2–F6 ---

/** Vistas guardadas (N11). */
export const savedView = pgTable("saved_view", {
  ...baseColumns(),
  userId: text("user_id").notNull(),
  module: text("module").notNull(),
  name: text("name").notNull(),
  query: text("query").notNull(),
  pinned: boolean("pinned").notNull().default(false),
  sort: integer("sort").notNull().default(0),
});

/** Revisión semanal (F3). */
export const weeklyReview = pgTable(
  "weekly_review",
  {
    ...baseColumns(),
    userId: text("user_id").notNull(),
    week: text("week").notNull(),
    completedAt: tz("completed_at"),
    noteId: uuid("note_id"),
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [uniqueIndex("weekly_review_week").on(t.workspaceId, t.userId, t.week)],
);

/** Registro de horas (F3, opcional). */
export const timeEntry = pgTable(
  "time_entry",
  {
    ...baseColumns(),
    projectId: uuid("project_id"),
    taskId: uuid("task_id"),
    userId: text("user_id").notNull(),
    minutes: integer("minutes").notNull(),
    date: date("date").notNull(),
    billable: boolean("billable").notNull().default(true),
    rate: numeric("rate", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("ARS"),
    note: text("note"),
  },
  (t) => [index("time_entry_project").on(t.projectId, t.date)],
);

export const noteTemplate = pgTable("note_template", {
  ...baseColumns(),
  name: text("name").notNull(),
  bodyMd: text("body_md").notNull().default(""),
});

/** Servicios de interés de una oportunidad (N–N). */
export const opportunityService = pgTable(
  "opportunity_service",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    opportunityId: uuid("opportunity_id").notNull(),
    serviceId: uuid("service_id").notNull(),
  },
  (t) => [uniqueIndex("opportunity_service_unique").on(t.opportunityId, t.serviceId)],
);

/** Etapas del pipeline editables (F4). Si no hay filas, se usan las fijas. */
export const crmStage = pgTable("crm_stage", {
  ...baseColumns(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  probability: integer("probability").notNull().default(10),
  sort: integer("sort").notNull().default(0),
  kind: text("kind").notNull().default("open"),
});

/** Aceptación pública de presupuestos (F2). */
export const quoteDecision = pgTable("quote_decision", {
  id: pk(),
  workspaceId: uuid("workspace_id").notNull(),
  quoteId: uuid("quote_id").notNull(),
  versionId: uuid("version_id").notNull(),
  decision: text("decision").notNull(),
  signerName: text("signer_name").notNull(),
  comment: text("comment"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  at: tz("at").notNull().defaultNow(),
});

/** Web Push (PWA). */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
    userAgent: text("user_agent"),
    createdAt: tz("created_at").notNull().defaultNow(),
    lastOkAt: tz("last_ok_at"),
  },
  (t) => [uniqueIndex("push_endpoint").on(t.endpoint)],
);

export const notificationPreference = pgTable(
  "notification_preference",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    eventType: text("event_type").notNull(),
    inApp: boolean("in_app").notNull().default(true),
    push: boolean("push").notNull().default(true),
    email: boolean("email").notNull().default(false),
  },
  (t) => [uniqueIndex("notification_pref_unique").on(t.userId, t.eventType)],
);

/** Invitaciones a colaboradores y clientes (F6). */
export const invitation = pgTable("invitation", {
  ...baseColumns(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: tz("expires_at").notNull(),
  acceptedAt: tz("accepted_at"),
  clientId: uuid("client_id"),
  projectIds: uuid("project_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
});

/** Acceso de colaboradores (member) y clientes (client) a proyectos puntuales. */
export const projectMember = pgTable(
  "project_member",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("project_member_unique").on(t.projectId, t.userId)],
);
