import { todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { handleEvent as handleAutomationEvent } from "@agencyos/modules/automations/service";
import { notify, ownersOf } from "@agencyos/modules/notifications/notify";
import { purgeTrash } from "@agencyos/modules/trash/service";
import { and, asc, eq, isNull } from "drizzle-orm";
import { log } from "./log";

/**
 * Eventos del outbox que generan un aviso (motor `notify`: preferencias, horario de descanso, push y email).
 * El valor arma el título (null = usar el resumen de la actividad). Nunca se avisa a alguien de lo que hizo él mismo.
 */
const NOTIFY: Record<string, ((p: Record<string, unknown>) => string | null) | null> = {
  "aprobacion.solicitada": null,
  "presupuesto.aceptado": null,
  "presupuesto.rechazado": null,
  "presupuesto.visto": null,
  "presupuesto.vencido": null,
  "oportunidad.ganada": null,
  "cobro.vencido": null,
  "pago.vencido": null,
  // Portal de clientes y usuarios (M15): lo que hace un cliente le llega al dueño.
  "entrega.aprobada_por_cliente": null,
  "entrega.cambios_pedidos": null,
  "revision.feedback_cliente": null,
  "satisfaccion.respondida": null,
  "usuario.unido": null,
  // Agente supervisado (Centro de control): lo que necesita una respuesta tuya.
  "objetivo.pregunta": null,
  "objetivo.plan_propuesto": null,
  "objetivo.aprobacion_pedida": null,
  "objetivo.para_revisar": null,
};

/** Outbox → actividad ya registrada; acá se despachan avisos y automatizaciones y se marcan como enviados. Idempotente. */
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
    const fromAgent = ev.actorType === "agent";
    const notifies = fromAgent || ev.type in NOTIFY;
    if (notifies) {
      const [act] = ev.entityId
        ? await db
            .select({ summary: schema.activity.summary })
            .from(schema.activity)
            .where(and(eq(schema.activity.workspaceId, ev.workspaceId), eq(schema.activity.verb, ev.type), eq(schema.activity.entityId, ev.entityId)))
            .limit(1)
        : [];
      const builder = NOTIFY[ev.type];
      const text = ((builder ? builder(ev.payload as Record<string, unknown>) : null) || act?.summary || ev.type).slice(0, 200);
      const recipients = (await ownersOf(ev.workspaceId)).filter((u) => !(ev.actorType === "user" && ev.actorId === u));
      if (recipients.length)
        await notify({
          workspaceId: ev.workspaceId,
          userIds: recipients,
          type: fromAgent && !(ev.type in NOTIFY) ? "agente.actividad" : ev.type,
          title: text,
          entityType: ev.entityType,
          entityId: ev.entityId,
          dedupeKey: `ev:${ev.id}`,
        }).catch((e) => log.warn({ err: String(e), type: ev.type }, "aviso falló"));
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

export async function purge() {
  const n = await purgeTrash(30);
  log.info({ purged: n }, "papelera purgada");
  return n;
}
