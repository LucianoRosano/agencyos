import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns, pk, tz } from "./_common";

// --- Website Factory (M06) y Activos técnicos (docs/04 §8) ---

export const site = pgTable(
  "site",
  {
    ...baseColumns(),
    clientId: uuid("client_id"),
    projectId: uuid("project_id"),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("institutional"),
    stack: text("stack").notNull().default("wordpress"),
    publicationStatus: text("publication_status").notNull().default("building"),
    prodUrl: text("prod_url"),
    stagingUrl: text("staging_url"),
    docsNoteId: uuid("docs_note_id"),
    notesMd: text("notes_md"),
    monitorEnabled: boolean("monitor_enabled").notNull().default(false),
  },
  (t) => [
    index("site_ws").on(t.workspaceId, t.publicationStatus),
    check("site_kind", sql`${t.kind} in ('institutional','landing','store','catalog','b2b','blog','app')`),
    check("site_pub", sql`${t.publicationStatus} in ('building','staging','ready','live','maintenance')`),
  ],
);

export const siteEnvironment = pgTable("site_environment", {
  ...baseColumns(),
  siteId: uuid("site_id").notNull(),
  kind: text("kind").notNull().default("prod"),
  url: text("url").notNull(),
  hostingId: uuid("hosting_id"),
  phpVersion: text("php_version"),
  wpVersion: text("wp_version"),
  lastSeenAt: tz("last_seen_at"),
  /** Estado del último chequeo (up/down) y TLS. */
  lastStatus: text("last_status"),
  lastCheckedAt: tz("last_checked_at"),
  sslExpiresOn: date("ssl_expires_on"),
  sslIssuer: text("ssl_issuer"),
  integrationId: uuid("integration_id"),
});

export const siteBrief = pgTable("site_brief", {
  ...baseColumns(),
  siteId: uuid("site_id").notNull(),
  answers: jsonb("answers").$type<Record<string, unknown>>().notNull().default({}),
  questionsForClient: jsonb("questions_for_client").$type<string[]>().notNull().default([]),
  version: integer("version").notNull().default(1),
});

export const siteRequirement = pgTable("site_requirement", {
  ...baseColumns(),
  siteId: uuid("site_id").notNull(),
  title: text("title").notNull(),
  moscow: text("moscow").notNull().default("must"),
  acceptanceMd: text("acceptance_md"),
  status: text("status").notNull().default("pending"),
  sort: integer("sort").notNull().default(0),
});

export type BlueprintTree = {
  pages: { key: string; title: string; path?: string; sections: { key: string; title: string; slots: { key: string; kind: string; label: string }[] }[] }[];
};

export const siteBlueprint = pgTable(
  "site_blueprint",
  {
    ...baseColumns(),
    siteId: uuid("site_id").notNull(),
    version: integer("version").notNull(),
    tree: jsonb("tree").$type<BlueprintTree>().notNull(),
    source: text("source").notNull().default("manual"),
    isCurrent: boolean("is_current").notNull().default(true),
  },
  (t) => [uniqueIndex("blueprint_site_version").on(t.siteId, t.version)],
);

export const contentSlot = pgTable(
  "content_slot",
  {
    ...baseColumns(),
    siteId: uuid("site_id").notNull(),
    blueprintVersion: integer("blueprint_version").notNull(),
    pageKey: text("page_key").notNull(),
    sectionKey: text("section_key").notNull(),
    slotKey: text("slot_key").notNull(),
    kind: text("kind").notNull().default("text"),
    status: text("status").notNull().default("pending"),
    assigneeType: text("assignee_type").notNull().default("user"),
    assigneeId: text("assignee_id"),
    bodyMd: text("body_md"),
    fileIds: uuid("file_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
  },
  (t) => [index("slot_site").on(t.siteId, t.pageKey), check("slot_status", sql`${t.status} in ('pending','draft','review','approved','published')`)],
);

export const revisionRound = pgTable("revision_round", {
  ...baseColumns(),
  siteId: uuid("site_id").notNull(),
  number: integer("number").notNull(),
  status: text("status").notNull().default("open"),
  openedAt: tz("opened_at").notNull().defaultNow(),
  closedAt: tz("closed_at"),
});

export const revisionItem = pgTable("revision_item", {
  ...baseColumns(),
  roundId: uuid("round_id").notNull(),
  pageRef: text("page_ref"),
  description: text("description").notNull(),
  screenshotFileId: uuid("screenshot_file_id"),
  priority: integer("priority").notNull().default(3),
  status: text("status").notNull().default("open"),
  assignee: text("assignee"),
});

export const launchCheck = pgTable("launch_check", {
  ...baseColumns(),
  siteId: uuid("site_id").notNull(),
  area: text("area").notNull(),
  item: text("item").notNull(),
  ownerType: text("owner_type").notNull().default("user"),
  status: text("status").notNull().default("todo"),
  evidenceMd: text("evidence_md"),
  sort: integer("sort").notNull().default(0),
});

export const credentialRef = pgTable("credential_ref", {
  ...baseColumns(),
  label: text("label").notNull(),
  vault: text("vault").notNull().default("bitwarden"),
  itemPath: text("item_path").notNull(),
  notes: text("notes"),
});

export const domain = pgTable(
  "domain",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    clientId: uuid("client_id"),
    siteId: uuid("site_id"),
    registrar: text("registrar"),
    holder: text("holder"),
    expiresOn: date("expires_on"),
    autoRenew: boolean("auto_renew").notNull().default(false),
    dnsRef: text("dns_ref"),
    credentialRefId: uuid("credential_ref_id"),
    notifyDaysBefore: integer("notify_days_before").notNull().default(30),
  },
  (t) => [uniqueIndex("domain_ws_name").on(t.workspaceId, t.name)],
);

export const hosting = pgTable("hosting", {
  ...baseColumns(),
  provider: text("provider").notNull(),
  plan: text("plan"),
  clientId: uuid("client_id"),
  expiresOn: date("expires_on"),
  location: text("location"),
  credentialRefId: uuid("credential_ref_id"),
  notifyDaysBefore: integer("notify_days_before").notNull().default(30),
});

export const certificate = pgTable("certificate", {
  ...baseColumns(),
  kind: text("kind").notNull().default("ssl"),
  subject: text("subject").notNull(),
  expiresOn: date("expires_on"),
  siteId: uuid("site_id"),
  clientId: uuid("client_id"),
  notes: text("notes"),
  notifyDaysBefore: integer("notify_days_before").notNull().default(30),
});

export const ownProduct = pgTable("own_product", {
  ...baseColumns(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("wp_plugin"),
  description: text("description"),
  repositoryId: uuid("repository_id"),
});

export const ownProductVersion = pgTable("own_product_version", {
  ...baseColumns(),
  productId: uuid("product_id").notNull(),
  version: text("version").notNull(),
  releasedAt: tz("released_at").notNull().defaultNow(),
  changelogMd: text("changelog_md"),
  artifactFileId: uuid("artifact_file_id"),
});

export const installation = pgTable("installation", {
  ...baseColumns(),
  productId: uuid("product_id").notNull(),
  versionId: uuid("version_id"),
  siteId: uuid("site_id"),
  clientId: uuid("client_id"),
  configRefMd: text("config_ref_md"),
  installedAt: date("installed_at"),
  status: text("status").notNull().default("active"),
});

export const uptimeCheck = pgTable(
  "uptime_check",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    siteEnvironmentId: uuid("site_environment_id").notNull(),
    checkedAt: tz("checked_at").notNull().defaultNow(),
    statusCode: integer("status_code"),
    ok: boolean("ok").notNull(),
    latencyMs: integer("latency_ms"),
    error: text("error"),
  },
  (t) => [index("uptime_env_time").on(t.siteEnvironmentId, t.checkedAt)],
);
