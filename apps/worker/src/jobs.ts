import { todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { handleEvent as handleAutomationEvent } from "@agencyos/modules/automations/service";
import { channelsFor, sendPush } from "@agencyos/modules/push/service";
import { sendEmail } from "@agencyos/modules/shared/email";
import { entityHref } from "@agencyos/modules/shared/entities";
import { getToday } from "@agencyos/modules/today/queries";
import { purgeTrash } from "@agencyos/modules/trash/service";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { log } from "./log";

/** Eventos que generan una notificación in-app para el dueño. */
const NOTIFY: Record<string, (p: Record<string, unknown>, summary: string) => string | null> = {
  "aprobacion.solicitada": (_p, s) => s,
  "bandeja.capturado": () => null,
  "presupuesto.aceptado": (_p, s) => s,
  "presupuesto.vencido": (_p, s) => s,
  "cobro.vencido": (_p, s) => s,
  "pago.vencido": (_p, s) => s,
};

/** Outbox → actividad ya registrada; acá se despachan notificaciones y se marcan como enviados. Idempotente. */
export async function dispatchOutbox(limit = 500) {
  const db = getDb();
  const events = await db
    .select()
    .from(schema.domainEvent)
    .where(isNull(schema.domainEvent.dispatchedAt))
    .orderBy(asc(schema.domainEvent.occurredAt))
    .limit(limit);
  if (!events.length) return 0;
  for (const ev of events) {
    const builder = NOTIFY[ev.type];
    const fromAgent = ev.actorType === "agent";
    const title = builder ? builder(ev.payload as Record<string, unknown>, "") : null;
    if (fromAgent || (builder && title !== null)) {
      const [act] = ev.entityId
        ? await db
            .select({ summary: schema.activity.summary })
            .from(schema.activity)
            .where(and(eq(schema.activity.workspaceId, ev.workspaceId), eq(schema.activity.verb, ev.type), eq(schema.activity.entityId, ev.entityId)))
            .limit(1)
        : [];
      const owners = await db
        .select({ userId: schema.membership.userId })
        .from(schema.membership)
        .where(and(eq(schema.membership.workspaceId, ev.workspaceId), inArray(schema.membership.role, ["owner", "admin"])));
      const text = (title || act?.summary || ev.type).slice(0, 200);
      const prefKey = fromAgent ? "agente.actividad" : ev.type;
      const url = ev.entityType && ev.entityId ? entityHref(ev.entityType, ev.entityId) : "/hoy";
      for (const o of owners) {
        const ch = await channelsFor(o.userId, prefKey);
        if (ch.inApp) {
          await db
            .insert(schema.notification)
            .values({
              workspaceId: ev.workspaceId,
              userId: o.userId,
              type: ev.type,
              title: text,
              entityType: ev.entityType,
              entityId: ev.entityId,
              dedupeKey: `ev:${ev.id}`,
            })
            .onConflictDoNothing();
        }
        if (ch.push)
          await sendPush(ev.workspaceId, o.userId, { title: "AGENCYOS", body: text, url, tag: ev.type }).catch((e) =>
            log.warn({ err: String(e) }, "push falló"),
          );
        if (ch.email) {
          const [u] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, o.userId));
          if (u) await sendEmail({ to: u.email, subject: `AGENCYOS · ${text}`, text: `${text}\n\n${process.env.APP_URL ?? ""}${url}` });
        }
      }
    }
    // Automatizaciones (M09): idempotente por (regla, evento); nunca lanza.
    await handleAutomationEvent(ev);
    await db.update(schema.domainEvent).set({ dispatchedAt: new Date() }).where(eq(schema.domainEvent.id, ev.id));
  }
  return events.length;
}

/** Vencimientos diarios: cobros/pagos vencidos (Finanzas) y presupuestos fuera de validez (Presupuestos). Idempotente. */
export async function dailyDueDates() {
  const { markOverdue } = await import("@agencyos/modules/finance/service");
  const { expireQuotes } = await import("@agencyos/modules/quotes/service");
  const today = todayAR();
  const finance = await markOverdue(today);
  const quotes = await expireQuotes(today);
  return { finance, quotes };
}

/** Resumen diario (8:00 ART): notificación in-app y, si Brevo está configurado, email. */
export async function dailySummary() {
  const db = getDb();
  const owners = await db
    .select({ userId: schema.membership.userId, workspaceId: schema.membership.workspaceId, email: schema.user.email, name: schema.user.name })
    .from(schema.membership)
    .innerJoin(schema.user, eq(schema.user.id, schema.membership.userId))
    .where(eq(schema.membership.role, "owner"));
  const today = todayAR();
  for (const o of owners) {
    const ctx = { workspaceId: o.workspaceId, userId: o.userId, role: "owner" as const, actor: { type: "system" as const, id: null, name: "Sistema" } };
    const d = await getToday(ctx, { userId: o.userId });
    const c = d.counts;
    const title = `Hoy: ${c.forToday} para hoy · ${c.overdue} vencidas · ${d.catchUp.length} para ponerse al día`;
    const ch = await channelsFor(o.userId, "resumen.diario");
    const [pref] = await db
      .select({ id: schema.notificationPreference.id })
      .from(schema.notificationPreference)
      .where(and(eq(schema.notificationPreference.userId, o.userId), eq(schema.notificationPreference.eventType, "resumen.diario")));
    const wantsEmail = pref ? ch.email : true; // por defecto el resumen va por mail (si Brevo está configurado)
    if (ch.inApp) {
      await db
        .insert(schema.notification)
        .values({ workspaceId: o.workspaceId, userId: o.userId, type: "resumen.diario", title, dedupeKey: `resumen:${today}` })
        .onConflictDoNothing();
    }
    if (ch.push) await sendPush(o.workspaceId, o.userId, { title: "Tu día en AGENCYOS", body: title, url: "/hoy", tag: "resumen" }).catch(() => 0);
    const lines = d.catchUp.slice(0, 10).map((i) => `• ${i.title} — ${i.subtitle}`);
    if (wantsEmail)
      await sendEmail({
        to: o.email,
        subject: `AGENCYOS · ${title}`,
        text: `${title}\n\n${lines.join("\n")}\n\nAbrí AGENCYOS: ${process.env.APP_URL ?? ""}/hoy`,
      });
  }
  return owners.length;
}

export async function purge() {
  const n = await purgeTrash(30);
  log.info({ purged: n }, "papelera purgada");
  return n;
}
