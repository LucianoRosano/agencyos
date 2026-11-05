import { sql } from "drizzle-orm";
import { bigint, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { baseColumns, pk, tz } from "./_common";

// --- Biblioteca de recursos (M08, docs/04 §10) ---

export const folder = pgTable("folder", {
  ...baseColumns(),
  parentId: uuid("parent_id"),
  name: text("name").notNull(),
  clientId: uuid("client_id"),
  projectId: uuid("project_id"),
});

export const file = pgTable(
  "file",
  {
    ...baseColumns(),
    folderId: uuid("folder_id"),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    width: integer("width"),
    height: integer("height"),
    kind: text("kind").notNull().default("other"),
    clientId: uuid("client_id"),
    projectId: uuid("project_id"),
    siteId: uuid("site_id"),
    description: text("description"),
    origin: text("origin").notNull().default("upload"),
    currentVersion: integer("current_version").notNull().default(1),
    thumbKey: text("thumb_key"),
    url: text("url"),
  },
  (t) => [index("file_ws").on(t.workspaceId, t.createdAt), index("file_client").on(t.clientId)],
);

export const fileVersion = pgTable("file_version", {
  id: pk(),
  workspaceId: uuid("workspace_id").notNull(),
  fileId: uuid("file_id").notNull(),
  version: integer("version").notNull(),
  storageKey: text("storage_key").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  uploadedBy: text("uploaded_by"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const fileAttachment = pgTable(
  "file_attachment",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    fileId: uuid("file_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("attachment_entity").on(t.entityType, t.entityId)],
);

export const brandKit = pgTable("brand_kit", {
  ...baseColumns(),
  clientId: uuid("client_id").notNull(),
  colors: jsonb("colors").$type<{ name: string; hex: string }[]>().notNull().default([]),
  fonts: jsonb("fonts").$type<{ name: string; usage?: string }[]>().notNull().default([]),
  logoFileIds: uuid("logo_file_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
  guidelinesFileId: uuid("guidelines_file_id"),
  notesMd: text("notes_md"),
});

export const reusableTemplate = pgTable("reusable_template", {
  ...baseColumns(),
  kind: text("kind").notNull().default("document"),
  name: text("name").notNull(),
  bodyMd: text("body_md").notNull().default(""),
  vars: jsonb("vars").$type<string[]>().notNull().default([]),
});
