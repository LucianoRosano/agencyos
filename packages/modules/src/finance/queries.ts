import { addDays, addMonths, assertCan, type Ctx, endOfMonth, fromCents, monthShort, startOfMonth, toCents, todayAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, scoped } from "../shared/db";

/** Lecturas de Finanzas. Todas exigen permiso de lectura de finanzas (un `member` no accede). */

const T = schema.transaction;
const can = (ctx: Ctx) => assertCan(ctx, "read", "finance");
const add = (a: string | null | undefined, b: string | null | undefined) => fromCents(toCents(a ?? "0") + toCents(b ?? "0"));
const sub = (a: string | null | undefined, b: string | null | undefined) => fromCents(toCents(a ?? "0") - toCents(b ?? "0"));

export type Money = { currency: string; total: string };
/** Suma por moneda sin mezclar monedas. */
function byCurrency(rows: { currency: string; total: string | null }[]): Money[] {
  const m = new Map<string, string>();
  for (const r of rows) m.set(r.currency, add(m.get(r.currency), r.total));
  return [...m.entries()].sort(([a], [b]) => (a === "ARS" ? -1 : b === "ARS" ? 1 : a.localeCompare(b))).map(([currency, total]) => ({ currency, total }));
}

// ---------------------------------------------------------------------------
// Libros, cuentas y categorías
// ---------------------------------------------------------------------------
export async function listLedgers(ctx: Ctx) {
  can(ctx);
  return getDb()
    .select({ id: schema.ledger.id, name: schema.ledger.name, spaceId: schema.ledger.spaceId, spaceKind: schema.space.kind })
    .from(schema.ledger)
    .leftJoin(schema.space, eq(schema.space.id, schema.ledger.spaceId))
    .where(scoped(schema.ledger, ctx))
    .orderBy(asc(schema.ledger.sort), asc(schema.ledger.name));
}
export type Ledger = Awaited<ReturnType<typeof listLedgers>>[number];

/** Libro de Agencia (por espacio o, en su defecto, el primero). Los cobros a clientes viven ahí. */
export const agencyLedger = (ledgers: Ledger[]) => ledgers.find((l) => l.spaceKind === "agency") ?? ledgers.find((l) => l.name === "Agencia") ?? ledgers[0];

/** Saldo actual = inicial + ingresos − gastos ± transferencias, en SQL con numeric. */
export async function listAccounts(ctx: Ctx, opts: { ledgerId?: string } = {}) {
  can(ctx);
  const where = [scoped(schema.moneyAccount, ctx)];
  if (opts.ledgerId) where.push(eq(schema.moneyAccount.ledgerId, opts.ledgerId));
  return getDb()
    .select({
      id: schema.moneyAccount.id,
      name: schema.moneyAccount.name,
      kind: schema.moneyAccount.kind,
      currency: schema.moneyAccount.currency,
      ledgerId: schema.moneyAccount.ledgerId,
      ledgerName: schema.ledger.name,
      openingBalance: schema.moneyAccount.openingBalance,
      openingDate: schema.moneyAccount.openingDate,
      movements: sql<number>`count(${T.id})::int`,
      balance: sql<string>`(${schema.moneyAccount.openingBalance} + coalesce(sum(case when ${T.kind} in ('income','transfer_in') then ${T.amount} else -${T.amount} end), 0))::numeric(14,2)::text`,
    })
    .from(schema.moneyAccount)
    .leftJoin(schema.ledger, eq(schema.ledger.id, schema.moneyAccount.ledgerId))
    .leftJoin(T, and(eq(T.accountId, schema.moneyAccount.id), isNull(T.deletedAt), eq(T.workspaceId, schema.moneyAccount.workspaceId)))
    .where(and(...where))
    .groupBy(schema.moneyAccount.id, schema.ledger.name, schema.ledger.sort)
    .orderBy(asc(schema.ledger.sort), asc(schema.moneyAccount.currency), asc(schema.moneyAccount.name));
}
export type AccountRow = Awaited<ReturnType<typeof listAccounts>>[number];

export async function getAccountBalance(ctx: Ctx, id: string) {
  return (await listAccounts(ctx)).find((a) => a.id === id) ?? null;
}

export async function listCategories(ctx: Ctx, opts: { withDeleted?: boolean } = {}) {
  can(ctx);
  const rows = await getDb()
    .select({ id: schema.category.id, name: schema.category.name, kind: schema.category.kind, parentId: schema.category.parentId, deletedAt: schema.category.deletedAt })
    .from(schema.category)
    .where(scoped(schema.category, ctx, { withDeleted: opts.withDeleted }))
    .orderBy(asc(schema.category.kind), asc(schema.category.name));
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Orden jerárquico: cada madre seguida de sus hijas.
  const out: (typeof rows[number] & { label: string; depth: number })[] = [];
  for (const r of rows.filter((x) => !x.parentId || !byId.has(x.parentId))) {
    out.push({ ...r, label: r.name, depth: 0 });
    for (const c of rows.filter((x) => x.parentId === r.id)) out.push({ ...c, label: `${r.name} › ${c.name}`, depth: 1 });
  }
  return out;
}
export type CategoryRow = Awaited<ReturnType<typeof listCategories>>[number];

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------
export type TxFilters = {
  ledgerId?: string;
  accountId?: string;
  categoryId?: string;
  kind?: "income" | "expense" | "transfer";
  from?: string;
  to?: string;
  q?: string;
  clientId?: string;
  projectId?: string;
};

const Pair = alias(T, "pair");
const PairAccount = alias(schema.moneyAccount, "pair_account");
const ParentCat = alias(schema.category, "parent_cat");

function txWhere(ctx: Ctx, f: TxFilters): SQL[] {
  const where: SQL[] = [scoped(T, ctx)];
  if (f.ledgerId) where.push(eq(T.ledgerId, f.ledgerId));
  if (f.accountId) where.push(eq(T.accountId, f.accountId));
  if (f.categoryId) where.push(sql`${T.categoryId} in (select id from category where id = ${f.categoryId} or parent_id = ${f.categoryId})`);
  if (f.kind === "transfer") where.push(inArray(T.kind, ["transfer_in", "transfer_out"]));
  else if (f.kind) where.push(eq(T.kind, f.kind));
  if (f.from) where.push(gte(T.date, f.from));
  if (f.to) where.push(lte(T.date, f.to));
  if (f.clientId) where.push(eq(T.clientId, f.clientId));
  if (f.projectId) where.push(eq(T.projectId, f.projectId));
  if (f.q?.trim()) {
    where.push(
      sql`f_search_norm(coalesce(${T.description}, '') || ' ' || coalesce(${T.counterpart}, '') || ' ' || coalesce(${schema.client.name}, '') || ' ' || coalesce(${schema.category.name}, '')) like '%' || f_search_norm(${f.q.trim()}) || '%'`,
    );
  }
  return where;
}

const txCols = {
  id: T.id,
  kind: T.kind,
  date: T.date,
  amount: T.amount,
  currency: T.currency,
  exchangeRate: T.exchangeRate,
  description: T.description,
  counterpart: T.counterpart,
  accountId: T.accountId,
  categoryId: T.categoryId,
  clientId: T.clientId,
  projectId: T.projectId,
  ledgerId: T.ledgerId,
  receivableId: T.receivableId,
  payableId: T.payableId,
  subscriptionId: T.subscriptionId,
  transferPairId: T.transferPairId,
  accountName: schema.moneyAccount.name,
  ledgerName: schema.ledger.name,
  categoryName: schema.category.name,
  parentCategoryName: ParentCat.name,
  clientName: schema.client.name,
  projectName: schema.project.name,
  pairAccountName: PairAccount.name,
};

function txQuery() {
  return getDb()
    .select(txCols)
    .from(T)
    .leftJoin(schema.moneyAccount, eq(schema.moneyAccount.id, T.accountId))
    .leftJoin(schema.ledger, eq(schema.ledger.id, T.ledgerId))
    .leftJoin(schema.category, eq(schema.category.id, T.categoryId))
    .leftJoin(ParentCat, eq(ParentCat.id, schema.category.parentId))
    .leftJoin(schema.client, eq(schema.client.id, T.clientId))
    .leftJoin(schema.project, eq(schema.project.id, T.projectId))
    .leftJoin(Pair, and(eq(Pair.transferPairId, T.transferPairId), sql`${Pair.id} <> ${T.id}`))
    .leftJoin(PairAccount, eq(PairAccount.id, Pair.accountId));
}

/** Lista con paginación por cursor (`fecha_id`, orden fecha desc, id desc). */
export async function listTransactions(ctx: Ctx, f: TxFilters & { cursor?: string; limit?: number } = {}) {
  can(ctx);
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const where = txWhere(ctx, f);
  const m = f.cursor?.match(/^(\d{4}-\d{2}-\d{2})_([0-9a-f-]{36})$/);
  if (m) where.push(or(sql`${T.date} < ${m[1]}`, and(eq(T.date, m[1] as string), sql`${T.id} < ${m[2]}`)) as SQL);
  const rows = await txQuery().where(and(...where)).orderBy(desc(T.date), desc(T.id)).limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? `${last.date}_${last.id}` : null };
}
export type TxRow = Awaited<ReturnType<typeof listTransactions>>["items"][number];

/** Totales por moneda del filtro actual (ingresos, gastos). */
export async function transactionTotals(ctx: Ctx, f: TxFilters = {}) {
  can(ctx);
  const rows = await getDb()
    .select({ kind: T.kind, currency: T.currency, total: sql<string>`sum(${T.amount})::text` })
    .from(T)
    .leftJoin(schema.client, eq(schema.client.id, T.clientId))
    .leftJoin(schema.category, eq(schema.category.id, T.categoryId))
    .where(and(...txWhere(ctx, f), inArray(T.kind, ["income", "expense"])))
    .groupBy(T.kind, T.currency);
  return { income: byCurrency(rows.filter((r) => r.kind === "income")), expense: byCurrency(rows.filter((r) => r.kind === "expense")) };
}

export async function exportTransactions(ctx: Ctx, f: TxFilters = {}) {
  can(ctx);
  return txQuery().where(and(...txWhere(ctx, f))).orderBy(asc(T.date), asc(T.id)).limit(20000);
}

export async function getTransaction(ctx: Ctx, id: string) {
  can(ctx);
  const [row] = await txQuery().where(and(eq(T.id, id), scoped(T, ctx)));
  return row ?? null;
}

/** Datos de la constancia de pago interna (solo cobros registrados). */
export async function getReceipt(ctx: Ctx, transactionId: string) {
  can(ctx);
  const tx = await getTransaction(ctx, transactionId);
  if (!tx || tx.kind !== "income" || !tx.receivableId) return null;
  const db = getDb();
  const [rec] = await db.select().from(schema.receivable).where(and(eq(schema.receivable.id, tx.receivableId), eq(schema.receivable.workspaceId, ctx.workspaceId)));
  const [client] = rec ? await db.select().from(schema.client).where(eq(schema.client.id, rec.clientId)) : [];
  const [ws] = await db.select().from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId));
  let number = tx.description?.match(/C-\d{4}-\d{4,}/)?.[0];
  if (!number) {
    // Respaldo: correlativo por orden de registro dentro del año.
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(T)
      .where(and(eq(T.workspaceId, ctx.workspaceId), isNotNull(T.receivableId), eq(T.kind, "income"), sql`extract(year from ${T.date}) = ${Number(tx.date.slice(0, 4))}`, sql`${T.id} <= ${tx.id}`));
    number = `C-${tx.date.slice(0, 4)}-${String(r?.n ?? 1).padStart(4, "0")}`;
  }
  return { tx, receivable: rec ?? null, client: client ?? null, settings: ws?.settings ?? {}, number };
}

// ---------------------------------------------------------------------------
// Suscripciones
// ---------------------------------------------------------------------------
/** Equivalente mensual (numeric en SQL): semanal × 52/12, anual ÷ 12, dividido por el intervalo. */
const monthlySql = sql<string>`round(case ${schema.subscription.frequency}
  when 'weekly' then ${schema.subscription.amount} * 52 / 12
  when 'yearly' then ${schema.subscription.amount} / 12
  else ${schema.subscription.amount} end / greatest(${schema.subscription.intervalCount}, 1), 2)::text`;

export async function listSubscriptions(ctx: Ctx, opts: { ledgerId?: string; status?: string } = {}) {
  can(ctx);
  const where = [scoped(schema.subscription, ctx)];
  if (opts.ledgerId) where.push(eq(schema.subscription.ledgerId, opts.ledgerId));
  if (opts.status) where.push(eq(schema.subscription.status, opts.status));
  return getDb()
    .select({
      s: schema.subscription,
      monthly: monthlySql,
      accountName: schema.moneyAccount.name,
      categoryName: schema.category.name,
      ledgerName: schema.ledger.name,
      lastPaid: sql<string | null>`(select max(t.date)::text from "transaction" t where t.subscription_id = ${schema.subscription.id} and t.deleted_at is null)`,
    })
    .from(schema.subscription)
    .leftJoin(schema.moneyAccount, eq(schema.moneyAccount.id, schema.subscription.accountId))
    .leftJoin(schema.category, eq(schema.category.id, schema.subscription.categoryId))
    .leftJoin(schema.ledger, eq(schema.ledger.id, schema.subscription.ledgerId))
    .where(and(...where))
    .orderBy(sql`case ${schema.subscription.status} when 'active' then 0 when 'paused' then 1 else 2 end`, asc(schema.subscription.nextDue));
}
export type SubscriptionRow = Awaited<ReturnType<typeof listSubscriptions>>[number];

/** "Cuánto me cuestan mis herramientas por mes": activas, normalizado a mensual, por moneda. */
export async function subscriptionMonthlyCost(ctx: Ctx, opts: { ledgerId?: string } = {}) {
  can(ctx);
  const where = [scoped(schema.subscription, ctx), eq(schema.subscription.status, "active")];
  if (opts.ledgerId) where.push(eq(schema.subscription.ledgerId, opts.ledgerId));
  const rows = await getDb()
    .select({
      currency: schema.subscription.currency,
      total: sql<string>`sum(round(case ${schema.subscription.frequency} when 'weekly' then ${schema.subscription.amount} * 52 / 12 when 'yearly' then ${schema.subscription.amount} / 12 else ${schema.subscription.amount} end / greatest(${schema.subscription.intervalCount}, 1), 2))::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.subscription)
    .where(and(...where))
    .groupBy(schema.subscription.currency);
  return { byCurrency: byCurrency(rows), count: rows.reduce((a, r) => a + r.n, 0) };
}

export async function getSubscription(ctx: Ctx, id: string) {
  can(ctx);
  const [row] = await getDb().select().from(schema.subscription).where(and(eq(schema.subscription.id, id), scoped(schema.subscription, ctx)));
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Por cobrar / por pagar
// ---------------------------------------------------------------------------
export type DebtView = "abiertos" | "saldados" | "anulados" | "todos";
const viewStatuses = (v: DebtView) => (v === "abiertos" ? ["pending", "partial", "overdue"] : v === "saldados" ? ["paid"] : v === "anulados" ? ["void"] : null);

export async function listReceivables(ctx: Ctx, opts: { view?: DebtView; clientId?: string } = {}) {
  can(ctx);
  const where = [scoped(schema.receivable, ctx)];
  const st = viewStatuses(opts.view ?? "abiertos");
  if (st) where.push(inArray(schema.receivable.status, st));
  if (opts.clientId) where.push(eq(schema.receivable.clientId, opts.clientId));
  const rows = await getDb()
    .select({ r: schema.receivable, clientName: schema.client.name, projectName: schema.project.name })
    .from(schema.receivable)
    .leftJoin(schema.client, eq(schema.client.id, schema.receivable.clientId))
    .leftJoin(schema.project, eq(schema.project.id, schema.receivable.projectId))
    .where(and(...where))
    .orderBy(sql`${schema.receivable.dueDate} asc nulls last`, desc(schema.receivable.createdAt))
    .limit(500);
  const ids = rows.map((x) => x.r.id);
  const payments = ids.length
    ? await getDb()
        .select({ id: T.id, receivableId: T.receivableId, date: T.date, amount: T.amount, currency: T.currency, description: T.description, accountName: schema.moneyAccount.name })
        .from(T)
        .leftJoin(schema.moneyAccount, eq(schema.moneyAccount.id, T.accountId))
        .where(and(scoped(T, ctx), inArray(T.receivableId, ids)))
        .orderBy(asc(T.date), asc(T.id))
    : [];
  return rows.map((x) => ({ ...x, payments: payments.filter((p) => p.receivableId === x.r.id) }));
}
export type ReceivableRow = Awaited<ReturnType<typeof listReceivables>>[number];

export async function getReceivable(ctx: Ctx, id: string) {
  can(ctx);
  const [row] = await getDb()
    .select({ r: schema.receivable, clientName: schema.client.name })
    .from(schema.receivable)
    .leftJoin(schema.client, eq(schema.client.id, schema.receivable.clientId))
    .where(and(eq(schema.receivable.id, id), scoped(schema.receivable, ctx)));
  return row ?? null;
}

export async function listPayables(ctx: Ctx, opts: { view?: DebtView; ledgerId?: string } = {}) {
  can(ctx);
  const where = [scoped(schema.payable, ctx)];
  const st = viewStatuses(opts.view ?? "abiertos");
  if (st) where.push(inArray(schema.payable.status, st));
  if (opts.ledgerId) where.push(eq(schema.payable.ledgerId, opts.ledgerId));
  const rows = await getDb()
    .select({ p: schema.payable, ledgerName: schema.ledger.name })
    .from(schema.payable)
    .leftJoin(schema.ledger, eq(schema.ledger.id, schema.payable.ledgerId))
    .where(and(...where))
    .orderBy(sql`${schema.payable.dueDate} asc nulls last`, desc(schema.payable.createdAt))
    .limit(500);
  const ids = rows.map((x) => x.p.id);
  const payments = ids.length
    ? await getDb()
        .select({ id: T.id, payableId: T.payableId, date: T.date, amount: T.amount, currency: T.currency, accountName: schema.moneyAccount.name })
        .from(T)
        .leftJoin(schema.moneyAccount, eq(schema.moneyAccount.id, T.accountId))
        .where(and(scoped(T, ctx), inArray(T.payableId, ids)))
        .orderBy(asc(T.date))
    : [];
  return rows.map((x) => ({ ...x, payments: payments.filter((p) => p.payableId === x.p.id) }));
}
export type PayableRow = Awaited<ReturnType<typeof listPayables>>[number];

export async function getPayable(ctx: Ctx, id: string) {
  can(ctx);
  const [row] = await getDb().select().from(schema.payable).where(and(eq(schema.payable.id, id), scoped(schema.payable, ctx)));
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------
export type Upcoming = { key: string; kind: "subscription" | "payable" | "receivable"; date: string; title: string; amount: string; currency: string; href: string; overdue: boolean };

export async function financeOverview(ctx: Ctx, opts: { ledgerId?: string; includeReceivables?: boolean; today?: string } = {}) {
  can(ctx);
  const db = getDb();
  const today = opts.today ?? todayAR();
  const from = startOfMonth(today);
  const to = endOfMonth(today);
  const sixFrom = startOfMonth(addMonths(today, -5));
  const in30 = addDays(today, 30);
  const L = opts.ledgerId;
  const withRec = opts.includeReceivables ?? true;
  const open = ["pending", "partial", "overdue"];
  const [accounts, month, series, rec, pay, subs, upPay, upRec, monthlyCost] = await Promise.all([
    listAccounts(ctx, { ledgerId: L }),
    db.select({ kind: T.kind, currency: T.currency, total: sql<string>`sum(${T.amount})::text` }).from(T)
      .where(and(scoped(T, ctx), gte(T.date, from), lte(T.date, to), inArray(T.kind, ["income", "expense"]), L ? eq(T.ledgerId, L) : undefined))
      .groupBy(T.kind, T.currency),
    db.select({ month: sql<string>`to_char(${T.date}, 'YYYY-MM')`, kind: T.kind, currency: T.currency, total: sql<string>`sum(${T.amount})::text` }).from(T)
      .where(and(scoped(T, ctx), gte(T.date, sixFrom), lte(T.date, to), inArray(T.kind, ["income", "expense"]), L ? eq(T.ledgerId, L) : undefined))
      .groupBy(sql`1`, T.kind, T.currency),
    withRec
      ? db.select({ currency: schema.receivable.currency, total: sql<string>`sum(${schema.receivable.amount} - ${schema.receivable.paidAmount})::text`, n: sql<number>`count(*)::int` }).from(schema.receivable)
          .where(and(scoped(schema.receivable, ctx), inArray(schema.receivable.status, open))).groupBy(schema.receivable.currency)
      : Promise.resolve([]),
    db.select({ currency: schema.payable.currency, total: sql<string>`sum(${schema.payable.amount} - ${schema.payable.paidAmount})::text`, n: sql<number>`count(*)::int` }).from(schema.payable)
      .where(and(scoped(schema.payable, ctx), inArray(schema.payable.status, open), L ? eq(schema.payable.ledgerId, L) : undefined)).groupBy(schema.payable.currency),
    db.select().from(schema.subscription)
      .where(and(scoped(schema.subscription, ctx), eq(schema.subscription.status, "active"), lte(schema.subscription.nextDue, in30), L ? eq(schema.subscription.ledgerId, L) : undefined))
      .orderBy(asc(schema.subscription.nextDue)),
    db.select().from(schema.payable)
      .where(and(scoped(schema.payable, ctx), inArray(schema.payable.status, open), lte(schema.payable.dueDate, in30), L ? eq(schema.payable.ledgerId, L) : undefined))
      .orderBy(asc(schema.payable.dueDate)),
    withRec
      ? db.select({ r: schema.receivable, clientName: schema.client.name }).from(schema.receivable).leftJoin(schema.client, eq(schema.client.id, schema.receivable.clientId))
          .where(and(scoped(schema.receivable, ctx), inArray(schema.receivable.status, open), lte(schema.receivable.dueDate, in30))).orderBy(asc(schema.receivable.dueDate))
      : Promise.resolve([]),
    subscriptionMonthlyCost(ctx, { ledgerId: L }),
  ]);

  const upcoming: Upcoming[] = [
    ...subs.map((s) => ({ key: `s-${s.id}`, kind: "subscription" as const, date: s.nextDue, title: `Renovar ${s.vendor}`, amount: s.amount, currency: s.currency, href: `/finanzas/suscripciones?pagar=${s.id}`, overdue: s.nextDue < today })),
    ...upPay.map((p) => ({ key: `p-${p.id}`, kind: "payable" as const, date: p.dueDate ?? today, title: `${p.counterpart}: ${p.concept}`, amount: sub(p.amount, p.paidAmount), currency: p.currency, href: `/finanzas/por-pagar?pagar=${p.id}`, overdue: (p.dueDate ?? today) < today })),
    ...upRec.map(({ r, clientName }) => ({ key: `r-${r.id}`, kind: "receivable" as const, date: r.dueDate ?? today, title: `Cobrar a ${clientName ?? "cliente"}: ${r.concept}`, amount: sub(r.amount, r.paidAmount), currency: r.currency, href: `/finanzas/por-cobrar?cobrar=${r.id}`, overdue: (r.dueDate ?? today) < today })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // Serie de 6 meses por moneda (nunca se convierte).
  const currencies = [...new Set(series.map((s) => s.currency))].sort((a, b) => (a === "ARS" ? -1 : b === "ARS" ? 1 : a.localeCompare(b)));
  const chart = currencies.map((currency) => {
    const months: { key: string; label: string; income: string; expense: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const k = addMonths(today, -i).slice(0, 7);
      months.push({ key: k, label: monthShort(Number(k.slice(5, 7))), income: "0.00", expense: "0.00" });
    }
    for (const s of series.filter((x) => x.currency === currency)) {
      const m = months.find((x) => x.key === s.month);
      if (m) m[s.kind === "income" ? "income" : "expense"] = add(m[s.kind === "income" ? "income" : "expense"], s.total);
    }
    return { currency, months };
  });

  const income = byCurrency(month.filter((m) => m.kind === "income"));
  const expense = byCurrency(month.filter((m) => m.kind === "expense"));
  const monthCurrencies = [...new Set([...income, ...expense].map((m) => m.currency))];
  const result = monthCurrencies.map((c) => ({ currency: c, total: sub(income.find((x) => x.currency === c)?.total, expense.find((x) => x.currency === c)?.total) }));

  return {
    today,
    month: from.slice(0, 7),
    accounts,
    balances: byCurrency(accounts.map((a) => ({ currency: a.currency, total: a.balance }))),
    income,
    expense,
    result,
    receivable: rec.map((r) => ({ currency: r.currency, total: r.total, n: r.n })),
    payable: pay.map((r) => ({ currency: r.currency, total: r.total, n: r.n })),
    upcoming,
    chart,
    monthlyCost,
  };
}
export type FinanceOverview = Awaited<ReturnType<typeof financeOverview>>;

// ---------------------------------------------------------------------------
// Reportes
// ---------------------------------------------------------------------------
/**
 * Monto convertido a la moneda del reporte usando SOLO la cotización cargada en el movimiento
 * (ARS por US$ 1). Sin cotización → null: el reporte lo muestra aparte, nunca inventa tasas.
 */
const conv = (rc: string) => sql<string | null>`case
  when ${T.currency} = ${rc} then ${T.amount}
  when ${T.exchangeRate} is not null and ${T.currency} = 'USD' and ${rc} = 'ARS' then round(${T.amount} * ${T.exchangeRate}, 2)
  when ${T.exchangeRate} is not null and ${T.currency} = 'ARS' and ${rc} = 'USD' then round(${T.amount} / ${T.exchangeRate}, 2)
  else null end`;

export type ReportOpts = { ledgerId?: string; from: string; to: string; currency: "ARS" | "USD" };
type Unconverted = { currency: string; kind: string; total: string; n: number };

function collectUnconverted(rows: { currency: string; kind: string; unconv: string | null; unconvN: number }[]): Unconverted[] {
  const m = new Map<string, Unconverted>();
  for (const r of rows) {
    if (!r.unconvN) continue;
    const k = `${r.currency}|${r.kind}`;
    const prev = m.get(k) ?? { currency: r.currency, kind: r.kind, total: "0.00", n: 0 };
    m.set(k, { ...prev, total: add(prev.total, r.unconv), n: prev.n + r.unconvN });
  }
  return [...m.values()];
}

/** Mensual por libro y categoría: ingresos, gastos y resultado en la moneda del reporte. */
export async function monthlyReport(ctx: Ctx, o: ReportOpts) {
  can(ctx);
  const c = conv(o.currency);
  const rows = await getDb()
    .select({
      month: sql<string>`to_char(${T.date}, 'YYYY-MM')`,
      kind: T.kind,
      currency: T.currency,
      categoryId: T.categoryId,
      categoryName: schema.category.name,
      parentName: ParentCat.name,
      conv: sql<string | null>`sum(${c})::text`,
      unconv: sql<string | null>`(sum(${T.amount}) filter (where ${c} is null))::text`,
      unconvN: sql<number>`(count(*) filter (where ${c} is null))::int`,
    })
    .from(T)
    .leftJoin(schema.category, eq(schema.category.id, T.categoryId))
    .leftJoin(ParentCat, eq(ParentCat.id, schema.category.parentId))
    .where(and(scoped(T, ctx), gte(T.date, o.from), lte(T.date, o.to), inArray(T.kind, ["income", "expense"]), o.ledgerId ? eq(T.ledgerId, o.ledgerId) : undefined))
    .groupBy(sql`1`, T.kind, T.currency, T.categoryId, schema.category.name, ParentCat.name);

  const months = new Map<string, { month: string; income: string; expense: string }>();
  const cats = new Map<string, { key: string; name: string; kind: string; total: string }>();
  for (const r of rows) {
    const m = months.get(r.month) ?? { month: r.month, income: "0.00", expense: "0.00" };
    const k = r.kind === "income" ? "income" : "expense";
    m[k] = add(m[k], r.conv);
    months.set(r.month, m);
    if (r.conv) {
      const ck = `${r.kind}|${r.categoryId ?? "none"}`;
      const name = r.categoryName ? (r.parentName ? `${r.parentName} › ${r.categoryName}` : r.categoryName) : "Sin categoría";
      const prev = cats.get(ck) ?? { key: ck, name, kind: r.kind, total: "0.00" };
      cats.set(ck, { ...prev, total: add(prev.total, r.conv) });
    }
  }
  const monthList = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, result: sub(m.income, m.expense) }));
  const totals = monthList.reduce((a, m) => ({ income: add(a.income, m.income), expense: add(a.expense, m.expense) }), { income: "0.00", expense: "0.00" });
  const byCat = [...cats.values()].sort((a, b) => Number(toCents(b.total) - toCents(a.total)));
  return {
    months: monthList,
    totals: { ...totals, result: sub(totals.income, totals.expense) },
    categories: { income: byCat.filter((x) => x.kind === "income"), expense: byCat.filter((x) => x.kind === "expense") },
    unconverted: collectUnconverted(rows),
  };
}

/** Rentabilidad simple: cobrado − gastos asignados, por cliente y por proyecto. */
export async function profitability(ctx: Ctx, o: ReportOpts) {
  can(ctx);
  const c = conv(o.currency);
  const db = getDb();
  const base = and(scoped(T, ctx), gte(T.date, o.from), lte(T.date, o.to), inArray(T.kind, ["income", "expense"]), o.ledgerId ? eq(T.ledgerId, o.ledgerId) : undefined);
  const clientExpr = sql<string | null>`coalesce(${T.clientId}, ${schema.project.clientId})`;
  const [byClient, byProject] = await Promise.all([
    db
      .select({
        id: clientExpr,
        name: sql<string | null>`(select name from client where id = coalesce(${T.clientId}, ${schema.project.clientId}))`,
        kind: T.kind,
        currency: T.currency,
        conv: sql<string | null>`sum(${c})::text`,
        unconv: sql<string | null>`(sum(${T.amount}) filter (where ${c} is null))::text`,
        unconvN: sql<number>`(count(*) filter (where ${c} is null))::int`,
      })
      .from(T)
      .leftJoin(schema.project, eq(schema.project.id, T.projectId))
      .where(and(base, sql`coalesce(${T.clientId}, ${schema.project.clientId}) is not null`))
      .groupBy(sql`1`, sql`2`, T.kind, T.currency),
    db
      .select({
        id: T.projectId,
        name: schema.project.name,
        kind: T.kind,
        currency: T.currency,
        conv: sql<string | null>`sum(${c})::text`,
        unconv: sql<string | null>`(sum(${T.amount}) filter (where ${c} is null))::text`,
        unconvN: sql<number>`(count(*) filter (where ${c} is null))::int`,
      })
      .from(T)
      .innerJoin(schema.project, eq(schema.project.id, T.projectId))
      .where(base)
      .groupBy(T.projectId, schema.project.name, T.kind, T.currency),
  ]);
  const fold = (rows: { id: string | null; name: string | null; kind: string; conv: string | null; unconvN: number }[]) => {
    const m = new Map<string, { id: string; name: string; income: string; expense: string; result: string; unconverted: number }>();
    for (const r of rows) {
      if (!r.id) continue;
      const prev = m.get(r.id) ?? { id: r.id, name: r.name ?? "—", income: "0.00", expense: "0.00", result: "0.00", unconverted: 0 };
      if (r.kind === "income") prev.income = add(prev.income, r.conv);
      else prev.expense = add(prev.expense, r.conv);
      prev.result = sub(prev.income, prev.expense);
      prev.unconverted += r.unconvN;
      m.set(r.id, prev);
    }
    return [...m.values()].sort((a, b) => Number(toCents(b.result) - toCents(a.result)));
  };
  return { clients: fold(byClient), projects: fold(byProject), unconverted: { clients: collectUnconverted(byClient), projects: collectUnconverted(byProject) } };
}
