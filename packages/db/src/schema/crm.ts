import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { baseColumns, pk, tz } from "./_common";

export const client = pgTable(
  "client",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    tradeName: text("trade_name"),
    industry: text("industry"),
    website: text("website"),
    city: text("city"),
    province: text("province"),
    relationship: text("relationship").notNull().default("external"),
    status: text("status").notNull().default("prospect"),
    source: text("source"),
    spaceId: uuid("space_id"),
    notesMd: text("notes_md"),
    lastActivityAt: tz("last_activity_at"),
  },
  (t) => [
    index("client_ws").on(t.workspaceId, t.status),
    check("client_status", sql`${t.status} in ('prospect','active','paused','finished','archived')`),
    check("client_rel", sql`${t.relationship} in ('family','referral','external')`),
  ],
);

export const clientFiscalHolder = pgTable("client_fiscal_holder", {
  ...baseColumns(),
  clientId: uuid("client_id").notNull(),
  legalName: text("legal_name").notNull(),
  taxId: text("tax_id"),
  vatCondition: text("vat_condition"),
  isDefault: boolean("is_default").notNull().default(true),
});

export const contact = pgTable(
  "contact",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    notesMd: text("notes_md"),
  },
  (t) => [index("contact_ws").on(t.workspaceId)],
);

export const clientContact = pgTable(
  "client_contact",
  {
    id: pk(),
    workspaceId: uuid("workspace_id").notNull(),
    clientId: uuid("client_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    roleInClient: text("role_in_client"),
  },
  (t) => [index("client_contact_client").on(t.clientId), index("client_contact_contact").on(t.contactId)],
);

export const interaction = pgTable(
  "interaction",
  {
    ...baseColumns(),
    clientId: uuid("client_id").notNull(),
    contactId: uuid("contact_id"),
    kind: text("kind").notNull(),
    occurredAt: tz("occurred_at").notNull(),
    summaryMd: text("summary_md").notNull(),
    nextStep: text("next_step"),
    nextStepDue: date("next_step_due"),
  },
  (t) => [
    index("interaction_client").on(t.clientId, t.occurredAt),
    check("interaction_kind", sql`${t.kind} in ('whatsapp','call','email','meeting','message','note')`),
  ],
);

export const opportunity = pgTable(
  "opportunity",
  {
    ...baseColumns(),
    clientId: uuid("client_id").notNull(),
    title: text("title").notNull(),
    stage: text("stage").notNull().default("new"),
    valueAmount: numeric("value_amount", { precision: 14, scale: 2 }),
    valueCurrency: text("value_currency").notNull().default("ARS"),
    probability: integer("probability").notNull().default(10),
    expectedClose: date("expected_close"),
    nextAction: text("next_action"),
    nextActionDue: date("next_action_due"),
    lostReason: text("lost_reason"),
    wonAt: tz("won_at"),
    lostAt: tz("lost_at"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    index("opportunity_ws_stage").on(t.workspaceId, t.stage),
    check("opportunity_stage", sql`${t.stage} in ('new','contacted','meeting','proposal_sent','negotiation','won','lost')`),
    check("opportunity_prob", sql`${t.probability} between 0 and 100`),
  ],
);
