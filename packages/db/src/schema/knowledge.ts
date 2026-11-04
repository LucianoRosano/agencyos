import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns, pk, tz } from "./_common";

export const note = pgTable(
  "note",
  {
    ...baseColumns(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    spaceId: uuid("space_id"),
    folderPath: text("folder_path"),
    bodyMd: text("body_md").notNull().default(""),
    frontmatter: jsonb("frontmatter").$type<Record<string, unknown>>().notNull().default({}),
    isDaily: boolean("is_daily").notNull().default(false),
    dailyDate: date("daily_date"),
    aliases: text("aliases").array().notNull().default(sql`ARRAY[]::text[]`),
    /** Entidad a la que pertenece la nota (proyecto, cliente, materia…), opcional. */
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    pinned: boolean("pinned").notNull().default(false),
    wordCount: integer("word_count").notNull().default(0),
    lastOpenedAt: tz("last_opened_at"),
  },
  (t) => [
    index("note_ws_updated").on(t.workspaceId, t.updatedAt),
    uniqueIndex("note_ws_slug").on(t.workspaceId, t.slug),
    index("note_entity").on(t.entityType, t.entityId),
  ],
);

export const noteVersion = pgTable(
  "note_version",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    noteId: uuid("note_id").notNull(),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
    createdBy: text("created_by"),
  },
  (t) => [index("note_version_note").on(t.noteId, t.createdAt)],
);

export const graphLayout = pgTable(
  "graph_layout",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    viewKey: text("view_key").notNull(),
    positions: jsonb("positions").$type<Record<string, [number, number]>>().notNull(),
    nodeCount: integer("node_count").notNull(),
    computedAt: tz("computed_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("graph_layout_key").on(t.workspaceId, t.viewKey)],
);

export const course = pgTable(
  "course",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    program: text("program"),
    term: text("term"),
    commission: text("commission"),
    teachers: text("teachers"),
    schedule: jsonb("schedule").$type<{ day: number; from: string; to: string; room?: string }[]>().notNull().default([]),
    status: text("status").notNull().default("cursando"),
    finalGrade: numeric("final_grade", { precision: 4, scale: 2 }),
    spaceId: uuid("space_id"),
    color: text("color"),
    notesMd: text("notes_md"),
  },
  (t) => [check("course_status", sql`${t.status} in ('cursando','regular','aprobada','final_pendiente','abandonada')`)],
);

export const assessment = pgTable(
  "assessment",
  {
    ...baseColumns(),
    courseId: uuid("course_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title"),
    date: date("date").notNull(),
    time: text("time"),
    topicsMd: text("topics_md"),
    targetGrade: numeric("target_grade", { precision: 4, scale: 2 }),
    grade: numeric("grade", { precision: 4, scale: 2 }),
  },
  (t) => [
    index("assessment_course").on(t.courseId, t.date),
    check("assessment_kind", sql`${t.kind} in ('parcial','tp','final','recuperatorio','otro')`),
  ],
);
