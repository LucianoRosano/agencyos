import { addDays, addMonths, type Ctx, diffDays, endOfMonth, startOfMonth, todayAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { listActivity } from "../activity/queries";
import { getDb, scoped } from "../shared/db";

export type Range = "mes" | "trimestre" | "anio" | "personalizado";

export function resolveRange(range: Range, today = todayAR(), from?: string, to?: string) {
  let start: string;
  let end: string;
  if (range === "personalizado" && from && to && from <= to) {
    start = from;
    end = to;
  } else if (range === "trimestre") {
    const q = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
    start = `${today.slice(0, 4)}-${String(q * 3 + 1).padStart(2, "0")}-01`;
    end = endOfMonth(addMonths(start, 2));
  } else if (range === "anio") {
    start = `${today.slice(0, 4)}-01-01`;
    end = `${today.slice(0, 4)}-12-31`;
  } else {
    start = startOfMonth(today);
    end = endOfMonth(today);
  }
  const len = diffDays(end, start) + 1;
  return { start, end, prevStart: addDays(start, -len), prevEnd: addDays(start, -1) };
}

type Money = { currency: string; total: string };

/** KPIs de la pestaña Negocio: solo datos reales; sin datos → arrays vacíos (la UI muestra el estado vacío). */
export async function businessKpis(ctx: Ctx, r: ReturnType<typeof resolveRange>) {
  const db = getDb();
  const money = (kind: "income" | "expense", a: string, b: string) =>
    db.select({ currency: schema.transaction.currency, total: sql<string>`sum(${schema.transaction.amount})::text` }).from(schema.transaction)
      .where(and(scoped(schema.transaction, ctx), eq(schema.transaction.kind, kind), gte(schema.transaction.date, a), lte(schema.transaction.date, b))).groupBy(schema.transaction.currency);
  const quoteStats = (a: string, b: string) =>
    db.execute<{ sent: number; accepted: number; rejected: number }>(sql`
      select count(*) filter (where sent_at::date between ${a} and ${b})::int as sent,
             count(*) filter (where status = 'accepted' and decided_at::date between ${a} and ${b})::int as accepted,
             count(*) filter (where status = 'rejected' and decided_at::date between ${a} and ${b})::int as rejected
      from quote where workspace_id = ${ctx.workspaceId} and deleted_at is null`).then((x) => x.rows[0] ?? { sent: 0, accepted: 0, rejected: 0 });

  const [clientsActive, projectsByStatus, tasks, income, expense, prevIncome, prevExpense, qs, prevQs, acceptedAmount, rec, pay, pipeline, profit, upcoming, activity, monthly] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.client).where(and(scoped(schema.client, ctx), eq(schema.client.status, "active"))).then((x) => x[0]?.n ?? 0),
    db.select({ status: schema.project.status, n: sql<number>`count(*)::int` }).from(schema.project).where(scoped(schema.project, ctx)).groupBy(schema.project.status),
    db.execute<{ open: number; overdue: number; done: number }>(sql`select count(*) filter (where status in ('todo','doing','waiting'))::int as open, count(*) filter (where status in ('todo','doing','waiting') and due_date < ${todayAR()})::int as overdue, count(*) filter (where status = 'done' and completed_at::date between ${r.start} and ${r.end})::int as done from task where workspace_id = ${ctx.workspaceId} and deleted_at is null`).then((x) => x.rows[0] ?? { open: 0, overdue: 0, done: 0 }),
    money("income", r.start, r.end), money("expense", r.start, r.end), money("income", r.prevStart, r.prevEnd), money("expense", r.prevStart, r.prevEnd),
    quoteStats(r.start, r.end), quoteStats(r.prevStart, r.prevEnd),
    db.execute<Money>(sql`select v.currency, sum(v.total)::text as total from quote q join quote_version v on v.id = q.current_version_id where q.workspace_id = ${ctx.workspaceId} and q.deleted_at is null and q.status = 'accepted' and q.decided_at::date between ${r.start} and ${r.end} group by v.currency`).then((x) => x.rows),
    db.select({ currency: schema.receivable.currency, total: sql<string>`sum(${schema.receivable.amount} - ${schema.receivable.paidAmount})::text` }).from(schema.receivable).where(and(scoped(schema.receivable, ctx), inArray(schema.receivable.status, ["pending", "partial", "overdue"]))).groupBy(schema.receivable.currency),
    db.select({ currency: schema.payable.currency, total: sql<string>`sum(${schema.payable.amount} - ${schema.payable.paidAmount})::text` }).from(schema.payable).where(and(scoped(schema.payable, ctx), inArray(schema.payable.status, ["pending", "partial", "overdue"]))).groupBy(schema.payable.currency),
    db.execute<{ stage: string; currency: string; n: number; total: string; weighted: string }>(sql`select stage, value_currency as currency, count(*)::int as n, coalesce(sum(value_amount),0)::text as total, coalesce(sum(value_amount * probability / 100.0),0)::numeric(14,2)::text as weighted from opportunity where workspace_id = ${ctx.workspaceId} and deleted_at is null and stage not in ('won','lost') group by stage, value_currency`).then((x) => x.rows),
    db.execute<{ id: string; name: string; currency: string; income: string; expense: string; result: string }>(sql`
      select c.id, c.name, t.currency,
        coalesce(sum(t.amount) filter (where t.kind = 'income'),0)::text as income,
        coalesce(sum(t.amount) filter (where t.kind = 'expense'),0)::text as expense,
        (coalesce(sum(t.amount) filter (where t.kind = 'income'),0) - coalesce(sum(t.amount) filter (where t.kind = 'expense'),0))::text as result
      from "transaction" t join client c on c.id = t.client_id
      where t.workspace_id = ${ctx.workspaceId} and t.deleted_at is null and t.date between ${r.start} and ${r.end}
      group by c.id, c.name, t.currency order by 6 desc limit 5`).then((x) => x.rows),
    db.execute<{ kind: string; title: string; date: string; href: string }>(sql`
      (select 'Suscripción' as kind, vendor as title, next_due::text as date, '/finanzas/suscripciones' as href from subscription where workspace_id = ${ctx.workspaceId} and deleted_at is null and status = 'active' and next_due <= ${addDays(todayAR(), 30)})
      union all (select 'Cobro', concept, due_date::text, '/finanzas/por-cobrar' from receivable where workspace_id = ${ctx.workspaceId} and deleted_at is null and status in ('pending','partial','overdue') and due_date <= ${addDays(todayAR(), 30)})
      union all (select 'Pago', concept, due_date::text, '/finanzas/por-pagar' from payable where workspace_id = ${ctx.workspaceId} and deleted_at is null and status in ('pending','partial','overdue') and due_date <= ${addDays(todayAR(), 30)})
      union all (select 'Vencimiento', title, due_date::text, '/hoy' from reminder where workspace_id = ${ctx.workspaceId} and deleted_at is null and done_at is null and due_date <= ${addDays(todayAR(), 30)})
      order by 3 limit 12`).then((x) => x.rows),
    listActivity(ctx, { limit: 20 }),
    db.execute<{ month: string; kind: string; total: string }>(sql`select to_char(date, 'YYYY-MM') as month, kind, sum(amount)::text as total from "transaction" where workspace_id = ${ctx.workspaceId} and deleted_at is null and currency = 'ARS' and kind in ('income','expense') and date >= ${startOfMonth(addMonths(todayAR(), -11))} group by 1, 2`).then((x) => x.rows),
  ]);
  return { clientsActive, projectsByStatus, tasks, income, expense, prevIncome, prevExpense, quotes: qs, prevQuotes: prevQs, acceptedAmount, receivable: rec, payable: pay, pipeline, profit, upcoming, activity, monthly };
}

