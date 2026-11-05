import { boolean, index, integer, jsonb, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { baseColumns, pk, tz } from "./_common";

// --- SEO Auditor (M07, docs/04 §9) ---

export const seoAudit = pgTable(
  "seo_audit",
  {
    ...baseColumns(),
    siteId: uuid("site_id"),
    rootUrl: text("root_url").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("queued"),
    startedAt: tz("started_at"),
    finishedAt: tz("finished_at"),
    pagesCrawled: integer("pages_crawled").notNull().default(0),
    score: integer("score"),
    scoreFormulaVersion: text("score_formula_version"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    reportFileId: uuid("report_file_id"),
    error: text("error"),
  },
  (t) => [index("seo_audit_ws").on(t.workspaceId, t.createdAt)],
);

export const seoPage = pgTable(
  "seo_page",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    auditId: uuid("audit_id").notNull(),
    url: text("url").notNull(),
    statusCode: integer("status_code"),
    redirectTo: text("redirect_to"),
    title: text("title"),
    metaDescription: text("meta_description"),
    h1: text("h1").array(),
    canonical: text("canonical"),
    robotsMeta: text("robots_meta"),
    indexable: boolean("indexable"),
    depth: integer("depth"),
    wordCount: integer("word_count"),
    sizeBytes: integer("size_bytes"),
    ttfbMs: integer("ttfb_ms"),
    structuredData: jsonb("structured_data"),
    og: jsonb("og"),
  },
  (t) => [index("seo_page_audit").on(t.auditId)],
);

export const seoLink = pgTable(
  "seo_link",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    auditId: uuid("audit_id").notNull(),
    fromUrl: text("from_url").notNull(),
    toUrl: text("to_url").notNull(),
    internal: boolean("internal").notNull(),
    statusCode: integer("status_code"),
    anchor: text("anchor"),
    nofollow: boolean("nofollow").notNull().default(false),
  },
  (t) => [index("seo_link_audit").on(t.auditId)],
);

export const seoIssue = pgTable(
  "seo_issue",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    auditId: uuid("audit_id").notNull(),
    code: text("code").notNull(),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    url: text("url"),
    details: jsonb("details").notNull().default({}),
    fingerprint: text("fingerprint").notNull(),
    taskId: uuid("task_id"),
  },
  (t) => [index("seo_issue_audit").on(t.auditId, t.severity)],
);

export const seoLighthouse = pgTable("seo_lighthouse", {
  id: pk(),
  workspaceId: uuid("workspace_id").notNull(),
  auditId: uuid("audit_id").notNull(),
  url: text("url").notNull(),
  strategy: text("strategy").notNull(),
  performance: integer("performance"),
  accessibility: integer("accessibility"),
  bestPractices: integer("best_practices"),
  seo: integer("seo"),
  labMetrics: jsonb("lab_metrics").notNull().default({}),
});

export const seoFieldMetrics = pgTable("seo_field_metrics", {
  id: pk(),
  workspaceId: uuid("workspace_id").notNull(),
  auditId: uuid("audit_id").notNull(),
  urlOrOrigin: text("url_or_origin").notNull(),
  formFactor: text("form_factor").notNull(),
  lcpP75: integer("lcp_p75"),
  inpP75: integer("inp_p75"),
  clsP75: numeric("cls_p75", { precision: 6, scale: 3 }),
  hasData: boolean("has_data").notNull().default(false),
  collectedAt: tz("collected_at").notNull().defaultNow(),
});

export const seoSchedule = pgTable("seo_schedule", {
  ...baseColumns(),
  siteId: uuid("site_id"),
  rootUrl: text("root_url").notNull(),
  frequency: text("frequency").notNull().default("monthly"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  active: boolean("active").notNull().default(true),
  nextRunOn: text("next_run_on"),
});
