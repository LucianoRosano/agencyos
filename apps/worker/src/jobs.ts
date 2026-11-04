import { todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { sendEmail } from "@agencyos/modules/shared/email";
import { getToday } from "@agencyos/modules/today/queries";
import { purgeTrash } from "@agencyos/modules/trash/service";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
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
  const events = await db.select().from(schema.domainEvent).where(isNull(schema.domainEvent.dispatchedAt)).orderBy(asc(schema.domainEvent.occurredAt)).limit(limit);
  if (!events.length) return 0;
  for (const ev of events) {
    const builder = NOTIFY[ev.type];
    const fromAgent = ev.actorType === "agent";
    const title = builder ? builder(ev.payload as Record<string, unknown>, "") : null;
    if (builder || fromAgent) {
      const [act] = ev.entityId
        ? await db.select({ summary: schema.activity.summary }).from(schema.activity).where(and(eq(schema.activity.workspaceId, ev.workspaceId), eq(schema.activity.verb, ev.type), eq(schema.activity.entityId, ev.entityId))).limit(1)
        : [];
      const owners = await db.select({ userId: schema.membership.userId }).from(schema.membership).where(and(eq(schema.membership.workspaceId, ev.workspaceId), inArray(schema.membership.role, ["owner", "admin"])));
      for (const o of owners) {
        await db
          .insert(schema.notification)
          .values({ workspaceId: ev.workspaceId, userId: o.userId, type: ev.type, title: (title || act?.summary || ev.type).slice(0, 200), entityType: ev.entityType, entityId: ev.entityId, dedupeKey: `ev:${ev.id}` })
          .onConflictDoNothing();
      }
    }
    await db.update(schema.domainEvent).set({ dispatchedAt: new Date() }).where(eq(schema.domainEvent.id, ev.id));
  }
  return events.length;
}

/** Vencimientos diarios: cobros/pagos vencidos y presupuestos fuera de validez. */
export async function dailyDueDates() {
  const db = getDb();
  const today = todayAR();
  const rec = await db.execute(sql`update receivable set status = 'overdue', updated_at = now() where deleted_at is null and status in ('pending','partial') and due_date < ${today} returning id, workspace_id, concept`);
  const pay = await db.execute(sql`update payable set status = 'overdue', updated_at = now() where deleted_at is null and status in ('pending','partial') and due_date < ${today} returning id, workspace_id, concept`);
  const quotes = await db.execute(sql`update quote q set status = 'expired', updated_at = now() from quote_version v where v.id = q.current_version_id and q.deleted_at is null and q.status in ('sent','viewed') and v.valid_until < ${today} returning q.id, q.workspace_id, q.number`);
  for (const r of rec.rows as { id: string; workspace_id: string; concept: string }[]) {
    await db.insert(schema.domainEvent).values({ workspaceId: r.workspace_id, type: "cobro.vencido", entityType: "receivable", entityId: r.id, actorType: "system", payload: {} });
    await db.insert(schema.activity).values({ workspaceId: r.workspace_id, entityType: "receivable", entityId: r.id, verb: "cobro.vencido", summary: `Venció el cobro «${r.concept}»`, actorType: "system", actorName: "Sistema" });
  }
  for (const r of pay.rows as { id: string; workspace_id: string; concept: string }[]) {
    await db.insert(schema.domainEvent).values({ workspaceId: r.workspace_id, type: "pago.vencido", entityType: "payable", entityId: r.id, actorType: "system", payload: {} });
    await db.insert(schema.activity).values({ workspaceId: r.workspace_id, entityType: "payable", entityId: r.id, verb: "pago.vencido", summary: `Venció el pago «${r.concept}»`, actorType: "system", actorName: "Sistema" });
  }
  for (const q of quotes.rows as { id: string; workspace_id: string; number: string }[]) {
    await db.insert(schema.domainEvent).values({ workspaceId: q.workspace_id, type: "presupuesto.vencido", entityType: "quote", entityId: q.id, actorType: "system", payload: {} });
    await db.insert(schema.activity).values({ workspaceId: q.workspace_id, entityType: "quote", entityId: q.id, verb: "presupuesto.vencido", summary: `Venció el presupuesto ${q.number}`, actorType: "system", actorName: "Sistema" });
  }
  return { receivables: rec.rowCount ?? 0, payables: pay.rowCount ?? 0, quotes: quotes.rowCount ?? 0 };
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
    await db.insert(schema.notification).values({ workspaceId: o.workspaceId, userId: o.userId, type: "resumen.diario", title, dedupeKey: `resumen:${today}` }).onConflictDoNothing();
    const lines = d.catchUp.slice(0, 10).map((i) => `• ${i.title} — ${i.subtitle}`);
    await sendEmail({ to: o.email, subject: `AGENCYOS · ${title}`, text: `${title}\n\n${lines.join("\n")}\n\nAbrí AGENCYOS: ${process.env.APP_URL ?? ""}/hoy` });
  }
  return owners.length;
}

export async function purge() {
  const n = await purgeTrash(30);
  log.info({ purged: n }, "papelera purgada");
  return n;
}
