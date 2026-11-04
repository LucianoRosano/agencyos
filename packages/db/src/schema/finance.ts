import { sql } from "drizzle-orm";
import { check, date, index, integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./_common";

const amount = (n: string) => numeric(n, { precision: 14, scale: 2 });
// La tabla de cuentas de dinero se llama "money_account" para no chocar con "account" de Better Auth.

export const ledger = pgTable("ledger", {
  ...baseColumns(),
  name: text("name").notNull(),
  spaceId: uuid("space_id"),
  sort: integer("sort").notNull().default(0),
});

export const moneyAccount = pgTable(
  "money_account",
  {
    ...baseColumns(),
    ledgerId: uuid("ledger_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("cash"),
    currency: text("currency").notNull().default("ARS"),
    openingBalance: amount("opening_balance").notNull().default("0"),
    openingDate: date("opening_date").notNull(),
  },
  (t) => [check("account_kind", sql`${t.kind} in ('cash','bank','wallet','usd','other')`)],
);

export const category = pgTable(
  "category",
  {
    ...baseColumns(),
    ledgerId: uuid("ledger_id"),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
  },
  (t) => [check("category_kind", sql`${t.kind} in ('income','expense')`)],
);

export const transaction = pgTable(
  "transaction",
  {
    ...baseColumns(),
    ledgerId: uuid("ledger_id").notNull(),
    accountId: uuid("account_id").notNull(),
    kind: text("kind").notNull(),
    date: date("date").notNull(),
    amount: amount("amount").notNull(),
    currency: text("currency").notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 14, scale: 4 }),
    rateBaseCurrency: text("rate_base_currency"),
    categoryId: uuid("category_id"),
    clientId: uuid("client_id"),
    projectId: uuid("project_id"),
    counterpart: text("counterpart"),
    description: text("description"),
    transferPairId: uuid("transfer_pair_id"),
    receivableId: uuid("receivable_id"),
    payableId: uuid("payable_id"),
    subscriptionId: uuid("subscription_id"),
  },
  (t) => [
    index("transaction_ws_date").on(t.workspaceId, t.date),
    index("transaction_account").on(t.accountId),
    check("transaction_kind", sql`${t.kind} in ('income','expense','transfer_in','transfer_out')`),
    check("transaction_amount_pos", sql`${t.amount} > 0`),
  ],
);

export const subscription = pgTable(
  "subscription",
  {
    ...baseColumns(),
    ledgerId: uuid("ledger_id").notNull(),
    vendor: text("vendor").notNull(),
    description: text("description"),
    amount: amount("amount").notNull(),
    currency: text("currency").notNull(),
    frequency: text("frequency").notNull().default("monthly"),
    intervalCount: integer("interval_count").notNull().default(1),
    nextDue: date("next_due").notNull(),
    accountId: uuid("account_id"),
    categoryId: uuid("category_id"),
    notifyDaysBefore: integer("notify_days_before").notNull().default(3),
    status: text("status").notNull().default("active"),
  },
  (t) => [
    index("subscription_due").on(t.workspaceId, t.nextDue),
    check("subscription_freq", sql`${t.frequency} in ('weekly','monthly','yearly')`),
    check("subscription_status", sql`${t.status} in ('active','paused','cancelled')`),
  ],
);

export const receivable = pgTable(
  "receivable",
  {
    ...baseColumns(),
    clientId: uuid("client_id").notNull(),
    projectId: uuid("project_id"),
    quoteId: uuid("quote_id"),
    concept: text("concept").notNull(),
    amount: amount("amount").notNull(),
    currency: text("currency").notNull(),
    dueDate: date("due_date"),
    status: text("status").notNull().default("pending"),
    paidAmount: amount("paid_amount").notNull().default("0"),
  },
  (t) => [
    index("receivable_ws_due").on(t.workspaceId, t.status, t.dueDate),
    check("receivable_status", sql`${t.status} in ('pending','partial','paid','overdue','void')`),
  ],
);

export const payable = pgTable(
  "payable",
  {
    ...baseColumns(),
    ledgerId: uuid("ledger_id").notNull(),
    counterpart: text("counterpart").notNull(),
    concept: text("concept").notNull(),
    amount: amount("amount").notNull(),
    currency: text("currency").notNull(),
    dueDate: date("due_date"),
    status: text("status").notNull().default("pending"),
    paidAmount: amount("paid_amount").notNull().default("0"),
  },
  (t) => [
    index("payable_ws_due").on(t.workspaceId, t.status, t.dueDate),
    check("payable_status", sql`${t.status} in ('pending','partial','paid','overdue','void')`),
  ],
);
