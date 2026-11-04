import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns, pk, tz } from "./_common";

export const project = pgTable(
  "project",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    spaceId: uuid("space_id").notNull(),
    clientId: uuid("client_id"),
    kind: text("kind").notNull().default("other"),
    goal: text("goal"),
    definitionOfDone: text("definition_of_done"),
    status: text("status").notNull().default("planning"),
    priority: integer("priority").notNull().default(3),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    deliveredDate: date("delivered_date"),
    nextAction: text("next_action"),
    ownerId: text("owner_id"),
    templateId: uuid("template_id"),
    quoteId: uuid("quote_id"),
    notesMd: text("notes_md"),
    progress: integer("progress").notNull().default(0),
    lastActivityAt: tz("last_activity_at").notNull().defaultNow(),
  },
  (t) => [
    index("project_ws_status").on(t.workspaceId, t.status),
    index("project_client").on(t.clientId),
    check("project_status", sql`${t.status} in ('idea','planning','in_progress','paused','blocked','done','archived')`),
    check("project_kind", sql`${t.kind} in ('website','store','panel','seo','maintenance','personal','study','other')`),
    check("project_next_action", sql`${t.status} <> 'in_progress' or (${t.nextAction} is not null and length(trim(${t.nextAction})) > 0)`),
  ],
);

export const projectPhase = pgTable(
  "project_phase",
  {
    ...baseColumns(),
    projectId: uuid("project_id").notNull(),
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    status: text("status").notNull().default("pending"),
    dueDate: date("due_date"),
  },
  (t) => [index("phase_project").on(t.projectId, t.sort)],
);

export const task = pgTable(
  "task",
  {
    ...baseColumns(),
    title: text("title").notNull(),
    descriptionMd: text("description_md"),
    spaceId: uuid("space_id").notNull(),
    projectId: uuid("project_id"),
    phaseId: uuid("phase_id"),
    parentTaskId: uuid("parent_task_id"),
    status: text("status").notNull().default("todo"),
    priority: integer("priority").notNull().default(3),
    dueDate: date("due_date"),
    dueTime: text("due_time"),
    rrule: text("rrule"),
    estimateMinutes: integer("estimate_minutes"),
    assigneeType: text("assignee_type").notNull().default("user"),
    assigneeId: text("assignee_id"),
    completedAt: tz("completed_at"),
    snoozedFrom: date("snoozed_from"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    index("task_ws_status_due").on(t.workspaceId, t.status, t.dueDate),
    index("task_project").on(t.projectId),
    index("task_parent").on(t.parentTaskId),
    check("task_status", sql`${t.status} in ('todo','doing','waiting','done','cancelled')`),
    check("task_priority", sql`${t.priority} between 1 and 4`),
    check("task_assignee", sql`${t.assigneeType} in ('user','agent','client')`),
  ],
);

export const taskChecklistItem = pgTable(
  "task_checklist_item",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("checklist_task").on(t.taskId)],
);

export const focusPick = pgTable(
  "focus_pick",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    date: date("date").notNull(),
    taskId: uuid("task_id").notNull(),
    slot: integer("slot").notNull(),
  },
  (t) => [uniqueIndex("focus_pick_slot").on(t.userId, t.date, t.slot), uniqueIndex("focus_pick_task").on(t.userId, t.date, t.taskId)],
);

export const focusSession = pgTable("focus_session", {
  id: pk(),
  workspaceId: uuid("workspace_id").notNull(),
  userId: text("user_id").notNull(),
  taskId: uuid("task_id"),
  startedAt: tz("started_at").notNull(),
  endedAt: tz("ended_at"),
  minutes: integer("minutes"),
  notesMd: text("notes_md"),
});

export const blocker = pgTable(
  "blocker",
  {
    ...baseColumns(),
    projectId: uuid("project_id").notNull(),
    waitingFor: text("waiting_for").notNull(),
    revisitOn: date("revisit_on"),
    resolvedAt: tz("resolved_at"),
  },
  (t) => [index("blocker_project").on(t.projectId)],
);

export const decision = pgTable(
  "decision",
  {
    ...baseColumns(),
    projectId: uuid("project_id").notNull(),
    title: text("title").notNull(),
    rationaleMd: text("rationale_md"),
    decidedOn: date("decided_on").notNull(),
    approvedBy: text("approved_by"),
  },
  (t) => [index("decision_project").on(t.projectId)],
);

export const deliverable = pgTable(
  "deliverable",
  {
    ...baseColumns(),
    projectId: uuid("project_id").notNull(),
    title: text("title").notNull(),
    contentMd: text("content_md"),
    dueDate: date("due_date"),
    status: text("status").notNull().default("pending"),
    approvedAt: tz("approved_at"),
    approvedByContactId: uuid("approved_by_contact_id"),
  },
  (t) => [
    index("deliverable_project").on(t.projectId),
    check("deliverable_status", sql`${t.status} in ('pending','delivered','approved','changes_requested')`),
  ],
);

export const changelogEntry = pgTable(
  "changelog_entry",
  {
    ...baseColumns(),
    projectId: uuid("project_id").notNull(),
    kind: text("kind").notNull().default("auto"),
    title: text("title").notNull(),
    bodyMd: text("body_md"),
    version: text("version"),
  },
  (t) => [index("changelog_project").on(t.projectId, t.createdAt)],
);

export type TemplateDefinition = {
  phases: { name: string; tasks: { title: string; offsetDays?: number; priority?: number }[] }[];
  checklist?: string[];
  clientQuestions?: string[];
  initialNote?: string;
};

export const projectTemplate = pgTable("project_template", {
  ...baseColumns(),
  key: text("key"),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("other"),
  description: text("description"),
  definition: jsonb("definition").$type<TemplateDefinition>().notNull(),
  sort: integer("sort").notNull().default(0),
});
