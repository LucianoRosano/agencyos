import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns, tz } from "./_common";

const amount = (n: string) => numeric(n, { precision: 14, scale: 2 });

export const service = pgTable(
  "service",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    descriptionMd: text("description_md"),
    deliverablesMd: text("deliverables_md"),
    unit: text("unit").notNull().default("project"),
    priceArs: amount("price_ars"),
    priceUsd: amount("price_usd"),
    projectTemplateId: uuid("project_template_id"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [check("service_unit", sql`${t.unit} in ('project','hour','month','page','product','item')`)],
);

export const quote = pgTable(
  "quote",
  {
    ...baseColumns(),
    number: text("number").notNull(),
    clientId: uuid("client_id").notNull(),
    contactId: uuid("contact_id"),
    opportunityId: uuid("opportunity_id"),
    title: text("title").notNull(),
    currentVersionId: uuid("current_version_id"),
    status: text("status").notNull().default("draft"),
    sentAt: tz("sent_at"),
    viewedAt: tz("viewed_at"),
    decidedAt: tz("decided_at"),
    projectId: uuid("project_id"),
    /** Enlace público (F2): solo se guarda el hash del token. */
    publicTokenHash: text("public_token_hash"),
    publicExpiresAt: tz("public_expires_at"),
  },
  (t) => [
    uniqueIndex("quote_number").on(t.workspaceId, t.number),
    index("quote_ws_status").on(t.workspaceId, t.status),
    check("quote_status", sql`${t.status} in ('draft','sent','viewed','accepted','rejected','expired','void')`),
  ],
);

export type PaymentPlan =
  | { kind: "single" }
  | { kind: "milestones"; items: { label: string; percent: number; offsetDays?: number }[] }
  | { kind: "monthly"; amount: string; months: number | null };

export const quoteVersion = pgTable(
  "quote_version",
  {
    ...baseColumns(),
    quoteId: uuid("quote_id").notNull(),
    version: integer("version").notNull(),
    currency: text("currency").notNull(),
    exchangeRateRef: numeric("exchange_rate_ref", { precision: 14, scale: 4 }),
    issueDate: date("issue_date").notNull(),
    validUntil: date("valid_until").notNull(),
    introMd: text("intro_md"),
    scopeMd: text("scope_md"),
    exclusionsMd: text("exclusions_md"),
    termsMd: text("terms_md"),
    paymentPlan: jsonb("payment_plan").$type<PaymentPlan>().notNull().default({ kind: "single" }),
    globalDiscountType: text("global_discount_type").notNull().default("none"),
    globalDiscountValue: amount("global_discount_value").notNull().default("0"),
    subtotal: amount("subtotal").notNull().default("0"),
    discountTotal: amount("discount_total").notNull().default("0"),
    total: amount("total").notNull().default("0"),
    notesMd: text("notes_md"),
    lockedAt: tz("locked_at"),
  },
  (t) => [uniqueIndex("quote_version_unique").on(t.quoteId, t.version)],
);

export const quoteItem = pgTable(
  "quote_item",
  {
    ...baseColumns(),
    quoteVersionId: uuid("quote_version_id").notNull(),
    serviceId: uuid("service_id"),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
    unit: text("unit"),
    unitPrice: amount("unit_price").notNull(),
    discountType: text("discount_type").notNull().default("none"),
    discountValue: amount("discount_value").notNull().default("0"),
    lineTotal: amount("line_total").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("quote_item_version").on(t.quoteVersionId, t.sort)],
);

export const quoteTemplate = pgTable("quote_template", {
  ...baseColumns(),
  name: text("name").notNull(),
  introMd: text("intro_md"),
  scopeMd: text("scope_md"),
  exclusionsMd: text("exclusions_md"),
  termsMd: text("terms_md"),
  defaultItems: jsonb("default_items").$type<{ description: string; quantity: string; unitPrice: string }[]>().notNull().default([]),
  defaultValidDays: integer("default_valid_days").notNull().default(15),
  isDefault: boolean("is_default").notNull().default(false),
});
