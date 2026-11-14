import { addMoney, type Ctx } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";
import { effectiveHourlyRate } from "./duration";
import type { HourlyTarget } from "./service";

export type TimeFilter = { projectId?: string; taskId?: string; limit?: number };

function where(ctx: Ctx, f: TimeFilter) {
  const parts = [scoped(schema.timeEntry, ctx)];
  if (f.projectId) parts.push(eq(schema.timeEntry.projectId, f.projectId));
  if (f.taskId) parts.push(eq(schema.timeEntry.taskId, f.taskId));
  return and(...parts);
}

/** Registros de tiempo (más recientes primero) con el título de la tarea y el nombre de quien cargó. */
export async function listTimeEntries(ctx: Ctx, f: TimeFilter) {
  return getDb()
    .select({
      e: schema.timeEntry,
      taskTitle: schema.task.title,
      projectName: schema.project.name,
      userName: schema.user.name,
    })
    .from(schema.timeEntry)
    .leftJoin(schema.task, eq(schema.task.id, schema.timeEntry.taskId))
    .leftJoin(schema.project, eq(schema.project.id, schema.timeEntry.projectId))
    .leftJoin(schema.user, eq(schema.user.id, schema.timeEntry.userId))
    .where(where(ctx, f))
    .orderBy(desc(schema.timeEntry.date), desc(schema.timeEntry.createdAt))
    .limit(f.limit ?? 200);
}

/** Total, facturable y semanas (lunes de cada semana ISO, más reciente primero). */
export async function timeSummary(ctx: Ctx, f: TimeFilter) {
  const db = getDb();
  const [totals] = await db
    .select({
      minutes: sql<number>`coalesce(sum(${schema.timeEntry.minutes}), 0)::int`,
      billable: sql<number>`coalesce(sum(${schema.timeEntry.minutes}) filter (where ${schema.timeEntry.billable}), 0)::int`,
      entries: sql<number>`count(*)::int`,
    })
    .from(schema.timeEntry)
    .where(where(ctx, f));
  const weeks = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${schema.timeEntry.date}::timestamp), 'YYYY-MM-DD')`,
      minutes: sql<number>`sum(${schema.timeEntry.minutes})::int`,
    })
    .from(schema.timeEntry)
    .where(where(ctx, f))
    .groupBy(sql`1`)
    .orderBy(sql`1 desc`)
    .limit(12);
  return { minutes: totals?.minutes ?? 0, billableMinutes: totals?.billable ?? 0, entries: totals?.entries ?? 0, weeks };
}

export function targetRate(ctx: { workspace?: { settings: unknown } } | null | undefined): { amount: string; currency: string } | null {
  const s = (ctx?.workspace?.settings ?? {}) as HourlyTarget;
  return s.targetHourlyRate ? { amount: s.targetHourlyRate, currency: s.targetHourlyCurrency ?? "ARS" } : null;
}

export type RateRow = { currency: string; income: string; rate: string | null };

/** Rentabilidad de un proyecto con horas: ingresos cobrados (movimientos de ingreso del proyecto) / horas, por moneda. */
export async function projectProfitability(ctx: Ctx, projectId: string) {
  const db = getDb();
  const [summary, income] = await Promise.all([
    timeSummary(ctx, { projectId }),
    db
      .select({ currency: schema.transaction.currency, total: sql<string>`sum(${schema.transaction.amount})::text` })
      .from(schema.transaction)
      .where(and(scoped(schema.transaction, ctx), eq(schema.transaction.kind, "income"), eq(schema.transaction.projectId, projectId)))
      .groupBy(schema.transaction.currency),
  ]);
  const rates: RateRow[] = income
    .map((i) => ({ currency: i.currency, income: addMoney(i.total), rate: effectiveHourlyRate(i.total, summary.minutes) }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
  return { ...summary, rates };
}

/** Minutos registrados por cliente (vía proyecto) en un rango de fechas. */
export async function minutesByClient(ctx: Ctx, clientIds: string[], start: string, end: string) {
  if (!clientIds.length) return new Map<string, number>();
  const rows = await getDb()
    .select({ clientId: schema.project.clientId, minutes: sql<number>`sum(${schema.timeEntry.minutes})::int` })
    .from(schema.timeEntry)
    .innerJoin(schema.project, eq(schema.project.id, schema.timeEntry.projectId))
    .where(
      and(
        scoped(schema.timeEntry, ctx),
        eq(schema.project.workspaceId, ctx.workspaceId),
        isNotNull(schema.project.clientId),
        inArray(schema.project.clientId, clientIds),
        gte(schema.timeEntry.date, start),
        lte(schema.timeEntry.date, end),
      ),
    )
    .groupBy(schema.project.clientId);
  return new Map(rows.map((r) => [r.clientId as string, r.minutes]));
}
