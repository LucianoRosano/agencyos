import { addDays, formatDate, formatMoney, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { sendEmail } from "../shared/email";
import { getToday } from "../today/queries";
import { notify, ownersOf } from "./notify";
import { clockAR, getNotifySettings } from "./settings";

/**
 * Jobs de avisos (worker):
 * - `digests` (cada hora): resumen del día a la hora que eligió cada persona, cierre del día (opcional) y
 *   resumen semanal los lunes.
 * - `reminderAlerts` (diario): vencimientos agendados, N días antes, el día anterior y el mismo día.
 * - `taskTimeReminders` (cada 5 min): tareas con hora, 15 minutos antes.
 * Todo idempotente por dedupeKey.
 */
const sysCtx = (workspaceId: string, userId: string) => ({
  workspaceId,
  userId,
  role: "owner" as const,
  actor: { type: "system" as const, id: null, name: "Sistema" },
});

async function owners() {
  return getDb()
    .select({ userId: schema.membership.userId, workspaceId: schema.membership.workspaceId, email: schema.user.email, name: schema.user.name })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(and(eq(schema.membership.role, "owner"), eq(schema.membership.status, "active")));
}

export async function digests(now = new Date()) {
  const c = clockAR(now);
  const out = { daily: 0, recap: 0, weekly: 0 };
  for (const o of await owners()) {
    const s = await getNotifySettings(o.userId);
    if (c.hour === s.digestHour) {
      out.daily += await dailyDigest(o, c.date);
      if (c.weekday === 1 && s.weeklyDigest) out.weekly += await weeklyDigest(o, c.date);
    }
    if (s.eveningRecap && c.hour === s.recapHour) out.recap += await eveningRecap(o, c.date);
  }
  return out;
}

type Owner = Awaited<ReturnType<typeof owners>>[number];

async function dailyDigest(o: Owner, today: string) {
  const d = await getToday(sysCtx(o.workspaceId, o.userId), { userId: o.userId });
  const k = d.counts;
  const title = `Hoy: ${k.forToday} para hoy · ${k.overdue} vencidas · ${d.catchUp.length} para ponerse al día`;
  const n = await notify({ workspaceId: o.workspaceId, userIds: [o.userId], type: "resumen.diario", title, url: "/hoy", dedupeKey: `resumen:${today}` });
  // El resumen diario va por mail por defecto (si Brevo está configurado), salvo que se apague en Configuración.
  const [pref] = await getDb()
    .select({ email: schema.notificationPreference.email })
    .from(schema.notificationPreference)
    .where(and(eq(schema.notificationPreference.userId, o.userId), eq(schema.notificationPreference.eventType, "resumen.diario")));
  if (n && (pref ? pref.email : true)) {
    const lines = d.catchUp.slice(0, 10).map((i) => `• ${i.title} — ${i.subtitle}`);
    await sendEmail({
      to: o.email,
      subject: `AGENCYOS · ${title}`,
      text: `${title}\n\n${lines.join("\n")}\n\nAbrí AGENCYOS: ${process.env.APP_URL ?? ""}/hoy`,
    }).catch(() => undefined);
  }
  return n;
}

/** Cierre del día: lo que se completó hoy y lo primero de mañana (motivador, sin push: prioridad baja). */
async function eveningRecap(o: Owner, today: string) {
  const db = getDb();
  const tomorrow = addDays(today, 1);
  const [[done], next] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.task)
      .where(
        and(
          eq(schema.task.workspaceId, o.workspaceId),
          isNull(schema.task.deletedAt),
          sql`(${schema.task.completedAt} at time zone 'America/Argentina/Buenos_Aires')::date = ${today}::date`,
        ),
      ),
    db
      .select({ title: schema.task.title })
      .from(schema.task)
      .where(
        and(
          eq(schema.task.workspaceId, o.workspaceId),
          isNull(schema.task.deletedAt),
          ne(schema.task.status, "done"),
          sql`${schema.task.dueDate} <= ${tomorrow}::date`,
        ),
      )
      .orderBy(schema.task.dueDate, schema.task.priority)
      .limit(3),
  ]);
  const n = done?.n ?? 0;
  const title = n ? `Buen trabajo: hoy cerraste ${n} ${n === 1 ? "tarea" : "tareas"}` : "Cierre del día: mañana arrancás con lo que quedó";
  const body = next.length ? `Para mañana: ${next.map((t) => t.title).join(" · ")}` : "Mañana no tenés nada vencido. 🙌";
  return notify({
    workspaceId: o.workspaceId,
    userIds: [o.userId],
    type: "resumen.cierre",
    title,
    body,
    url: "/hoy",
    dedupeKey: `cierre:${today}`,
    priority: "low",
  });
}

/** Resumen de la semana (lunes): lo hecho la semana pasada, lo vencido y la plata por cobrar. */
async function weeklyDigest(o: Owner, today: string) {
  const db = getDb();
  const from = addDays(today, -7);
  const ws = o.workspaceId;
  const [[k]] = await Promise.all([
    db
      .execute<{ done: number; overdue: number; recv_n: number; stalled: number }>(sql`
      select
        (select count(*)::int from task where workspace_id = ${ws} and deleted_at is null and status = 'done'
           and (completed_at at time zone 'America/Argentina/Buenos_Aires')::date >= ${from}::date) as done,
        (select count(*)::int from task where workspace_id = ${ws} and deleted_at is null and status <> 'done' and due_date < ${today}::date) as overdue,
        (select count(*)::int from receivable where workspace_id = ${ws} and deleted_at is null and status in ('pending','partial','overdue')) as recv_n,
        (select count(*)::int from project where workspace_id = ${ws} and deleted_at is null and archived_at is null and status = 'active'
           and updated_at < now() - interval '14 days') as stalled`)
      .then((r) => r.rows),
  ]);
  const recv = await db.execute<{ currency: string; total: string }>(sql`
    select currency, sum(amount - coalesce(paid_amount, 0))::text as total from receivable
    where workspace_id = ${ws} and deleted_at is null and status in ('pending','partial','overdue') group by currency`);
  const money = recv.rows.map((r) => formatMoney(r.total, r.currency)).join(" + ");
  const title = `Tu semana: ${k?.done ?? 0} tareas hechas · ${k?.overdue ?? 0} vencidas`;
  const body = [
    k?.recv_n ? `Por cobrar: ${money} (${k.recv_n})` : "Sin cobros pendientes",
    k?.stalled ? `${k.stalled} ${k.stalled === 1 ? "proyecto sin movimiento" : "proyectos sin movimiento"} hace 2 semanas` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return notify({ workspaceId: ws, userIds: [o.userId], type: "resumen.semanal", title, body, url: "/negocio", dedupeKey: `semanal:${today}` });
}

/** Vencimientos agendados: el día que corresponde avisar (N días antes), el día anterior y el mismo día. */
export async function reminderAlerts(today = todayAR()) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.reminder)
    .where(
      and(
        isNull(schema.reminder.doneAt),
        isNull(schema.reminder.deletedAt),
        sql`${schema.reminder.dueDate} between ${today}::date and (${today}::date + ${schema.reminder.notifyDaysBefore})`,
      ),
    );
  let n = 0;
  for (const r of rows) {
    const days = Math.round((Date.parse(r.dueDate) - Date.parse(today)) / 86_400_000);
    if (!(days === 0 || days === 1 || days === r.notifyDaysBefore)) continue;
    const when = days === 0 ? "Vence hoy" : days === 1 ? "Vence mañana" : `Vence en ${days} días (${formatDate(r.dueDate)})`;
    n += await notify({
      workspaceId: r.workspaceId,
      type: "recordatorio.vence",
      title: `${when}: ${r.title}`,
      body: r.notesMd?.slice(0, 200) ?? null,
      url: "/hoy",
      dedupeKey: `rem:${r.id}:${r.dueDate}:${days}`,
      priority: days === 0 ? "normal" : "low",
    });
  }
  return n;
}

/** Tareas con hora: aviso 15 minutos antes (a la persona asignada o, si no hay, a los dueños). */
export async function taskTimeReminders(now = new Date()) {
  const c = clockAR(now);
  const db = getDb();
  const rows = await db
    .select({
      id: schema.task.id,
      title: schema.task.title,
      workspaceId: schema.task.workspaceId,
      dueTime: schema.task.dueTime,
      assigneeId: schema.task.assigneeId,
      assigneeType: schema.task.assigneeType,
    })
    .from(schema.task)
    .where(and(isNull(schema.task.deletedAt), ne(schema.task.status, "done"), eq(schema.task.dueDate, c.date), sql`${schema.task.dueTime} is not null`));
  let n = 0;
  for (const t of rows) {
    const m = /^(\d{2}):(\d{2})/.exec(t.dueTime ?? "");
    if (!m) continue;
    const left = Number(m[1]) * 60 + Number(m[2]) - c.minutes;
    if (left < 0 || left > 15) continue;
    const users = t.assigneeType === "user" && t.assigneeId ? [t.assigneeId] : await ownersOf(t.workspaceId);
    const members = users.length
      ? await db
          .select({ userId: schema.membership.userId })
          .from(schema.membership)
          .where(and(eq(schema.membership.workspaceId, t.workspaceId), inArray(schema.membership.userId, users), eq(schema.membership.status, "active")))
      : [];
    n += await notify({
      workspaceId: t.workspaceId,
      userIds: members.map((x) => x.userId),
      type: "tarea.recordatorio",
      title: left <= 1 ? `Ahora: ${t.title}` : `En ${left} min: ${t.title}`,
      body: `A las ${t.dueTime}`,
      entityType: "task",
      entityId: t.id,
      dedupeKey: `tarea:${t.id}:${c.date}:${t.dueTime}`,
    });
  }
  return n;
}
