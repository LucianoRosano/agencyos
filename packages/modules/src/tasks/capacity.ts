import { addDays, assertCan, type Ctx, can, dayOfWeek, endOfMonth, startOfMonth, todayAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
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

/**
 * Capacidad a futuro (semanas de lunes a domingo, desde la actual): capacidad de los días hábiles que quedan contra
 * lo comprometido = tareas abiertas estimadas (lo vencido suma a la primera semana) + horas incluidas de los abonos
 * activos, repartidas en los días hábiles de cada mes. Sirve para decidir si entra un proyecto nuevo.
 */
export type WeekCapacity = {
  start: string;
  end: string;
  capacityMinutes: number;
  taskMinutes: number;
  retainerMinutes: number;
  tasks: number;
  unestimated: number;
};

const isWorkday = (d: string) => {
  const w = dayOfWeek(d);
  return w >= 1 && w <= 5;
};

function workdaysInMonth(iso: string) {
  let n = 0;
  for (let d = startOfMonth(iso), end = endOfMonth(iso); d <= end; d = addDays(d, 1)) if (isWorkday(d)) n++;
  return n;
}

export async function capacityAhead(ctx: Ctx & { workspace?: { settings?: unknown } }, opts: { weeks?: number; today?: string } = {}): Promise<WeekCapacity[]> {
  assertCan(ctx, "read", "task");
  const today = opts.today ?? todayAR();
  const weeks = Math.min(Math.max(opts.weeks ?? 6, 1), 12);
  const monday = addDays(today, -((dayOfWeek(today) + 6) % 7));
  const last = addDays(monday, weeks * 7 - 1);
  const cap = Math.round(capacityOf(ctx.workspace?.settings) * 60);
  const open = inArray(schema.task.status, ["todo", "doing", "waiting"]);
  const base = and(scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId), open, isNull(schema.task.parentTaskId));
  const db = getDb();
  const weekOf = sql<string>`to_char(date_trunc('week', greatest(${schema.task.dueDate}, ${today}::date)), 'YYYY-MM-DD')`;
  const [rows, retainers] = await Promise.all([
    db
      .select({
        week: weekOf,
        minutes: sql<number>`coalesce(sum(${schema.task.estimateMinutes}), 0)::int`,
        tasks: sql<number>`count(*)::int`,
        unestimated: sql<number>`count(*) filter (where ${schema.task.estimateMinutes} is null)::int`,
      })
      .from(schema.task)
      .where(and(base, isNotNull(schema.task.dueDate), lte(schema.task.dueDate, last)))
      .groupBy(sql`1`), // por posición: el parámetro de la fecha se repetiría distinto en el GROUP BY
    can(ctx, "read", "finance")
      ? db
          .select({ hours: schema.retainer.hoursIncluded, startDate: schema.retainer.startDate, endDate: schema.retainer.endDate })
          .from(schema.retainer)
          .where(and(scoped(schema.retainer, ctx), eq(schema.retainer.status, "active"), isNotNull(schema.retainer.hoursIncluded)))
      : Promise.resolve([]),
  ]);
  const by = new Map(rows.map((r) => [r.week, r]));
  const perMonthWorkdays = new Map<string, number>();
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(monday, i * 7);
    const end = addDays(start, 6);
    let capacityMinutes = 0;
    let retainerMinutes = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (d < today || !isWorkday(d)) continue;
      capacityMinutes += cap;
      const month = d.slice(0, 7);
      if (!perMonthWorkdays.has(month)) perMonthWorkdays.set(month, workdaysInMonth(d));
      const wd = perMonthWorkdays.get(month) ?? 20;
      for (const r of retainers) {
        if (r.startDate > d || (r.endDate && r.endDate < d)) continue;
        retainerMinutes += (Number(r.hours) * 60) / wd;
      }
    }
    const t = by.get(start);
    return {
      start,
      end,
      capacityMinutes,
      taskMinutes: t?.minutes ?? 0,
      retainerMinutes: Math.round(retainerMinutes),
      tasks: t?.tasks ?? 0,
      unestimated: t?.unestimated ?? 0,
    };
  });
}
