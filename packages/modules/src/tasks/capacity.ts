import { addDays, assertCan, type Ctx, dayOfWeek, todayAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { getDb, projectScope, scoped } from "../shared/db";

/**
 * Carga de la semana: minutos estimados de las tareas abiertas por día contra la capacidad diaria
 * (`workspace.settings.dailyCapacityHours`, 6 h por defecto, lunes a viernes). Lo vencido suma al día de hoy.
 */
export type DayLoad = { date: string; minutes: number; tasks: number; unestimated: number; capacityMinutes: number; workday: boolean };

export function capacityOf(settings: unknown): number {
  const h = Number((settings as { dailyCapacityHours?: unknown } | null)?.dailyCapacityHours);
  return Number.isFinite(h) && h > 0 && h <= 16 ? h : 6;
}

export async function weekLoad(ctx: Ctx & { workspace?: { settings?: unknown } }, opts: { from?: string; days?: number } = {}): Promise<DayLoad[]> {
  assertCan(ctx, "read", "task");
  const from = opts.from ?? todayAR();
  const days = Math.min(Math.max(opts.days ?? 7, 1), 14);
  const to = addDays(from, days - 1);
  const cap = Math.round(capacityOf(ctx.workspace?.settings) * 60);
  const open = inArray(schema.task.status, ["todo", "doing", "waiting"]);
  const base = and(scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId), open, isNull(schema.task.parentTaskId));
  const db = getDb();
  const [rows, overdue] = await Promise.all([
    db
      .select({
        date: schema.task.dueDate,
        minutes: sql<number>`coalesce(sum(${schema.task.estimateMinutes}), 0)::int`,
        tasks: sql<number>`count(*)::int`,
        unestimated: sql<number>`count(*) filter (where ${schema.task.estimateMinutes} is null)::int`,
      })
      .from(schema.task)
      .where(and(base, gte(schema.task.dueDate, from), lte(schema.task.dueDate, to)))
      .groupBy(schema.task.dueDate),
    db
      .select({
        minutes: sql<number>`coalesce(sum(${schema.task.estimateMinutes}), 0)::int`,
        tasks: sql<number>`count(*)::int`,
        unestimated: sql<number>`count(*) filter (where ${schema.task.estimateMinutes} is null)::int`,
      })
      .from(schema.task)
      .where(and(base, lt(schema.task.dueDate, from))),
  ]);
  const by = new Map(rows.map((r) => [r.date as string, r]));
  const late = overdue[0];
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const dow = dayOfWeek(date);
    const workday = dow >= 1 && dow <= 5;
    const r = by.get(date);
    const extra = i === 0 && late ? late : { minutes: 0, tasks: 0, unestimated: 0 };
    return {
      date,
      minutes: (r?.minutes ?? 0) + extra.minutes,
      tasks: (r?.tasks ?? 0) + extra.tasks,
      unestimated: (r?.unestimated ?? 0) + extra.unestimated,
      capacityMinutes: workday ? cap : 0,
      workday,
    };
  });
}
