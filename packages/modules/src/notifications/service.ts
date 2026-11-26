import { addDays, type Ctx, notFound, validation } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { sendPush } from "../push/service";
import { getDb } from "../shared/db";
import { notificationUrl } from "./notify";
import { clockAR, getNotifySettings, inQuietHours } from "./settings";

/**
 * Centro de avisos: lista por vista, leído/no leído, archivar, posponer y abrir (marca leído y devuelve el enlace).
 * Los pospuestos «vuelven» solos a la hora elegida (job) y los diferidos por el horario de descanso se mandan juntos.
 */
export type NotificationView = "sin-leer" | "todas" | "pospuestas" | "archivadas";
const N = schema.notification;

const mine = (ctx: Ctx) => and(eq(N.userId, ctx.userId ?? ""), eq(N.workspaceId, ctx.workspaceId));
const visible = and(isNull(N.archivedAt), or(isNull(N.snoozedUntil), lte(N.snoozedUntil, sql`now()`)));

export async function listNotifications(ctx: Ctx, view: NotificationView | number = "todas", limit = 150) {
  if (!ctx.userId) return [];
  const v = typeof view === "number" ? "todas" : view;
  const lim = typeof view === "number" ? view : limit;
  const where =
    v === "sin-leer"
      ? and(mine(ctx), visible, isNull(N.readAt))
      : v === "pospuestas"
        ? and(mine(ctx), isNull(N.archivedAt), sql`${N.snoozedUntil} > now()`)
        : v === "archivadas"
          ? and(mine(ctx), isNotNull(N.archivedAt))
          : and(mine(ctx), visible);
  const rows = await getDb()
    .select()
    .from(N)
    .where(where)
    .orderBy(v === "pospuestas" ? N.snoozedUntil : desc(N.createdAt))
    .limit(lim);
  return rows.map((r) => ({ ...r, href: notificationUrl(r) }));
}

export async function unreadCount(ctx: Ctx) {
  if (!ctx.userId) return 0;
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(N)
    .where(and(mine(ctx), visible, isNull(N.readAt)));
  return r?.n ?? 0;
}

export async function unreadCountFor(userId: string, workspaceId: string) {
  return unreadCount({ userId, workspaceId } as Ctx);
}

/** Cuántos hay en cada vista (para las pestañas). */
export async function notificationCounts(ctx: Ctx) {
  if (!ctx.userId) return { unread: 0, snoozed: 0, archived: 0 };
  const [r] = await getDb()
    .select({
      unread: sql<number>`count(*) filter (where ${N.readAt} is null and ${N.archivedAt} is null and (${N.snoozedUntil} is null or ${N.snoozedUntil} <= now()))::int`,
      snoozed: sql<number>`count(*) filter (where ${N.archivedAt} is null and ${N.snoozedUntil} > now())::int`,
      archived: sql<number>`count(*) filter (where ${N.archivedAt} is not null)::int`,
    })
    .from(N)
    .where(mine(ctx));
  return r ?? { unread: 0, snoozed: 0, archived: 0 };
}

/** Lo último no leído (para el aviso en vivo con la app abierta). */
export async function latestUnread(ctx: Ctx) {
  if (!ctx.userId) return null;
  const [r] = await getDb()
    .select({
      id: N.id,
      title: N.title,
      body: N.body,
      priority: N.priority,
      type: N.type,
      url: N.url,
      entityType: N.entityType,
      entityId: N.entityId,
      createdAt: N.createdAt,
    })
    .from(N)
    .where(and(mine(ctx), visible, isNull(N.readAt)))
    .orderBy(desc(N.createdAt))
    .limit(1);
  return r ? { ...r, href: notificationUrl(r) } : null;
}

export async function markAllRead(ctx: Ctx) {
  if (!ctx.userId) return { ids: [] as string[] };
  const rows = await getDb()
    .update(N)
    .set({ readAt: new Date() })
    .where(and(mine(ctx), visible, isNull(N.readAt)))
    .returning({ id: N.id });
  return { ids: rows.map((r) => r.id) };
}

const ids = z.array(z.string().uuid()).min(1).max(500);

/** Deshacer «marcar todo como leído». */
export async function markUnreadMany(ctx: Ctx, raw: unknown) {
  if (!ctx.userId) return;
  await getDb()
    .update(N)
    .set({ readAt: null })
    .where(and(mine(ctx), inArray(N.id, ids.parse(raw))));
}

export async function markRead(ctx: Ctx, id: string) {
  if (!ctx.userId) return;
  await getDb()
    .update(N)
    .set({ readAt: new Date() })
    .where(and(eq(N.id, id), mine(ctx), isNull(N.readAt)));
}

export async function markUnread(ctx: Ctx, id: string) {
  if (!ctx.userId) return;
  await getDb()
    .update(N)
    .set({ readAt: null })
    .where(and(eq(N.id, id), mine(ctx)));
}

export async function archiveNotification(ctx: Ctx, id: string, archived = true) {
  if (!ctx.userId) return;
  const [r] = await getDb()
    .update(N)
    .set(archived ? { archivedAt: new Date(), readAt: sql`coalesce(${N.readAt}, now())` } : { archivedAt: null })
    .where(and(eq(N.id, id), mine(ctx)))
    .returning({ id: N.id });
  if (!r) throw notFound("El aviso");
}

/** Abrir un aviso: lo marca leído y devuelve a dónde ir (solo si es de esta persona). */
export async function openNotification(ctx: Ctx, id: string) {
  if (!ctx.userId || !z.string().uuid().safeParse(id).success) return null;
  const [r] = await getDb()
    .update(N)
    .set({ readAt: sql`coalesce(${N.readAt}, now())` })
    .where(and(eq(N.id, id), mine(ctx)))
    .returning();
  return r ? notificationUrl(r) : null;
}

export const SNOOZE_OPTIONS = ["1h", "3h", "tarde", "manana", "lunes"] as const;
export type SnoozeOption = (typeof SNOOZE_OPTIONS)[number];

/** Hora de vuelta de un aviso pospuesto (en hora argentina: «esta tarde» 18:00, «mañana» y «lunes» 9:00). */
export function snoozeUntil(option: SnoozeOption, now = new Date()): Date {
  if (option === "1h") return new Date(now.getTime() + 3_600_000);
  if (option === "3h") return new Date(now.getTime() + 3 * 3_600_000);
  const c = clockAR(now);
  const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-03:00`);
  if (option === "tarde") return c.minutes < 18 * 60 ? at(c.date, "18:00") : at(addDays(c.date, 1), "18:00");
  if (option === "manana") return at(addDays(c.date, 1), "09:00");
  return at(addDays(c.date, (8 - c.weekday) % 7 || 7), "09:00");
}

export async function snoozeNotification(ctx: Ctx, id: string, option: string) {
  if (!ctx.userId) return null;
  const opt = z.enum(SNOOZE_OPTIONS, { error: "Elegí cuándo volver a avisarte" }).parse(option);
  const until = snoozeUntil(opt);
  const [r] = await getDb()
    .update(N)
    .set({ snoozedUntil: until, readAt: null })
    .where(and(eq(N.id, id), mine(ctx), isNull(N.archivedAt)))
    .returning({ id: N.id });
  if (!r) throw notFound("El aviso");
  return { until };
}

export async function unsnoozeNotification(ctx: Ctx, id: string) {
  if (!ctx.userId) return;
  await getDb()
    .update(N)
    .set({ snoozedUntil: null })
    .where(and(eq(N.id, id), mine(ctx)));
}

/** Acción desde la notificación del sistema (botones del push). */
export async function notificationAction(ctx: Ctx, id: string, action: string) {
  if (!z.string().uuid().safeParse(id).success) throw validation("Aviso inválido");
  if (action === "read") return markRead(ctx, id);
  if (action === "snooze") return snoozeNotification(ctx, id, "3h");
  throw validation("Acción desconocida");
}

// ---------- Jobs (worker) ----------

/** Pospuestos que vencieron: vuelven arriba como nuevos y suenan (respetando el horario de descanso). */
export async function wakeSnoozed(now = new Date()) {
  const db = getDb();
  const rows = await db
    .update(N)
    .set({ snoozedUntil: null, createdAt: now, readAt: null })
    .where(and(isNotNull(N.snoozedUntil), lte(N.snoozedUntil, now), isNull(N.archivedAt)))
    .returning();
  for (const r of rows) {
    const s = await getNotifySettings(r.userId);
    if (inQuietHours(s, now) && r.priority !== "urgent") {
      await db.update(N).set({ pushState: "deferred" }).where(eq(N.id, r.id));
      continue;
    }
    if (r.priority === "low") continue;
    await sendPush(r.workspaceId, r.userId, {
      title: `De nuevo: ${r.title}`,
      body: r.body ?? undefined,
      url: `/notificaciones/abrir/${r.id}`,
      tag: `snz:${r.id}`,
      id: r.id,
    }).catch(() => 0);
  }
  return rows.length;
}

/** Al terminar el horario de descanso: un solo push con lo que llegó mientras tanto. */
export async function flushDeferred(now = new Date()) {
  const db = getDb();
  const pending = await db
    .select({
      userId: N.userId,
      workspaceId: N.workspaceId,
      n: sql<number>`count(*)::int`,
      titles: sql<string[]>`(array_agg(${N.title} order by ${N.createdAt} desc))[1:3]`,
    })
    .from(N)
    .where(and(eq(N.pushState, "deferred"), isNull(N.readAt), isNull(N.archivedAt)))
    .groupBy(N.userId, N.workspaceId);
  let sent = 0;
  for (const p of pending) {
    const s = await getNotifySettings(p.userId);
    if (inQuietHours(s, now)) continue;
    const body = p.titles.join(" · ");
    await sendPush(p.workspaceId, p.userId, {
      title: p.n === 1 ? (p.titles[0] ?? "Tenés un aviso") : `Mientras descansabas: ${p.n} avisos`,
      body: p.n === 1 ? undefined : body,
      url: "/notificaciones?ver=sin-leer",
      tag: "descanso",
    }).catch(() => 0);
    await db
      .update(N)
      .set({ pushState: "sent" })
      .where(and(eq(N.userId, p.userId), eq(N.workspaceId, p.workspaceId), eq(N.pushState, "deferred")));
    sent++;
  }
  // Los diferidos que se leyeron o archivaron mientras tanto ya no necesitan push.
  await db
    .update(N)
    .set({ pushState: "sent" })
    .where(and(eq(N.pushState, "deferred"), or(isNotNull(N.readAt), isNotNull(N.archivedAt))));
  return sent;
}

/** Limpieza: los avisos leídos de más de 120 días y los archivados de más de 30 se borran. */
export async function purgeNotifications() {
  const r = await getDb()
    .delete(N)
    .where(
      or(
        and(isNotNull(N.readAt), sql`${N.createdAt} < now() - interval '120 days'`),
        and(isNotNull(N.archivedAt), sql`${N.archivedAt} < now() - interval '30 days'`),
      ),
    )
    .returning({ id: N.id });
  return r.length;
}
