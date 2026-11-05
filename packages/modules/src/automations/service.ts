import { randomBytes } from "node:crypto";
import { assertCan, type Ctx, conflict, notFound, validation, zRequired } from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "../shared/crypto";
import { assertOwned, getDb, scoped } from "../shared/db";
import { assertPublicUrl } from "../shared/safe-fetch";
import { setTaskStatus } from "../tasks/service";
import { eventLabel, SCHEDULE_SOURCES } from "./catalog";
import type { TriggerEvent } from "./data";
import { cronFrequencyOk, cronToPreset, describeCron, deterministicUuid, presetToCron, verifyWebhookSignature } from "./engine";
import { AUTOMATION_ACTOR, automationCtx, creatorRole, type ExecuteResult, executeRule, ruleSource, type RuleRow, type RunOutput, type StoredConditions } from "./runner";
import { findTemplate } from "./templates";
import { type RuleInput, type RuleParsed, ruleInput } from "./validators";

const R = "settings" as const;

// ---------------------------------------------------------------------------------------------
// Reglas
// ---------------------------------------------------------------------------------------------

/** Acepta el objeto del constructor o su JSON (campo `payload` de un formulario). */
function parseRule(raw: unknown): RuleParsed {
  let v = raw;
  if (v && typeof v === "object" && "payload" in v && typeof (v as { payload: unknown }).payload === "string") v = (v as { payload: string }).payload;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      throw validation("No se pudo leer la regla");
    }
  }
  return ruleInput.parse(v);
}

async function toStored(t: Parameters<typeof assertOwned>[0], ctx: Ctx, r: RuleParsed) {
  for (const [i, a] of r.actions.entries()) {
    if (a.type !== "webhook") continue;
    const [ep] = await t
      .select({ id: schema.webhookEndpoint.id, direction: schema.webhookEndpoint.direction })
      .from(schema.webhookEndpoint)
      .where(and(scoped(schema.webhookEndpoint, ctx), eq(schema.webhookEndpoint.id, a.params.endpointId)));
    if (!ep || ep.direction !== "out") throw validation("Elegí un webhook saliente válido", { [`actions.${i}.params.endpointId`]: "Webhook inválido" });
  }
  let cron: string | null = null;
  if (r.triggerKind === "schedule" && r.schedule) {
    try {
      cron = presetToCron(r.schedule);
    } catch (e) {
      throw validation(e instanceof Error ? e.message : "Programación inválida", { schedule: "Programación inválida" });
    }
    if (!cronFrequencyOk(cron)) throw validation("Como mucho, una vez por hora");
  }
  const source = r.triggerKind === "schedule" && r.source && r.source.kind !== "none" ? { kind: r.source.kind, days: r.source.days ?? 0 } : undefined;
  const conditions: StoredConditions = { match: r.conditions.match, items: r.conditions.items, ...(source ? { source } : {}) };
  return {
    name: r.name,
    triggerKind: r.triggerKind,
    eventType: r.triggerKind === "event" ? (r.eventType ?? null) : null,
    cron,
    conditions,
    actions: r.actions as { type: string; params: Record<string, unknown> }[],
    testMode: r.testMode ?? false,
  };
}

export async function createRule(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "update", R);
  const input = parseRule(raw);
  return getDb().transaction(async (t) => {
    const values = await toStored(t, ctx, input);
    const [row] = await t
      .insert(schema.automationRule)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, ...values, templateKey: input.templateKey ?? null })
      .returning();
    if (!row) throw new Error("No se pudo crear la regla");
    await recordEvent(t, ctx, { type: "automatizacion.creada", entityType: "automation_rule", entityId: row.id, summary: `Creó la automatización «${row.name}»` });
    await audit(t, ctx, { action: "automation.create", targetType: "automation_rule", targetId: row.id, after: values });
    return row;
  });
}

async function getOwnRule(t: Parameters<typeof assertOwned>[0], ctx: Ctx, id: string) {
  const [r] = await t
    .select()
    .from(schema.automationRule)
    .where(and(eq(schema.automationRule.id, id), scoped(schema.automationRule, ctx)));
  if (!r) throw notFound("La automatización");
  return r;
}

export async function updateRule(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", R);
  const input = parseRule(raw);
  return getDb().transaction(async (t) => {
    const before = await getOwnRule(t, ctx, id);
    const values = await toStored(t, ctx, input);
    const [row] = await t.update(schema.automationRule).set(values).where(eq(schema.automationRule.id, id)).returning();
    if (!row) throw notFound("La automatización");
    await recordEvent(t, ctx, { type: "automatizacion.actualizada", entityType: "automation_rule", entityId: id, summary: `Editó la automatización «${row.name}»` });
    await audit(t, ctx, { action: "automation.update", targetType: "automation_rule", targetId: id, before: { actions: before.actions, conditions: before.conditions }, after: values });
    return row;
  });
}

export async function setRuleActive(ctx: Ctx, id: string, active: boolean) {
  assertCan(ctx, "update", R);
  return getDb().transaction(async (t) => {
    const r = await getOwnRule(t, ctx, id);
    const [row] = await t.update(schema.automationRule).set({ active: Boolean(active) }).where(eq(schema.automationRule.id, id)).returning();
    await recordEvent(t, ctx, {
      type: active ? "automatizacion.activada" : "automatizacion.pausada",
      entityType: "automation_rule",
      entityId: id,
      summary: `${active ? "Activó" : "Pausó"} la automatización «${r.name}»`,
    });
    return row;
  });
}

export async function setRuleTestMode(ctx: Ctx, id: string, on: boolean) {
  assertCan(ctx, "update", R);
  return getDb().transaction(async (t) => {
    const r = await getOwnRule(t, ctx, id);
    const [row] = await t.update(schema.automationRule).set({ testMode: Boolean(on) }).where(eq(schema.automationRule.id, id)).returning();
    await recordEvent(t, ctx, {
      type: "automatizacion.actualizada",
      entityType: "automation_rule",
      entityId: id,
      summary: `${on ? "Puso en modo prueba" : "Sacó del modo prueba"} la automatización «${r.name}»`,
    });
    return row;
  });
}

export async function duplicateRule(ctx: Ctx, id: string) {
  assertCan(ctx, "update", R);
  return getDb().transaction(async (t) => {
    const r = await getOwnRule(t, ctx, id);
    const [row] = await t
      .insert(schema.automationRule)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        name: `${r.name} (copia)`.slice(0, 120),
        triggerKind: r.triggerKind,
        eventType: r.eventType,
        cron: r.cron,
        conditions: r.conditions,
        actions: r.actions,
        active: false,
        testMode: r.testMode,
        templateKey: r.templateKey,
      })
      .returning();
    if (!row) throw new Error("No se pudo duplicar");
    await recordEvent(t, ctx, { type: "automatizacion.creada", entityType: "automation_rule", entityId: row.id, summary: `Duplicó la automatización «${r.name}» (queda pausada)` });
    return row;
  });
}

/** Crea una regla tal cual la plantilla. */
export async function createRuleFromTemplate(ctx: Ctx, key: string) {
  const tpl = findTemplate(key);
  if (!tpl) throw notFound("La plantilla");
  return createRule(ctx, { ...tpl.rule, templateKey: tpl.key });
}

/** Regla guardada → entrada del constructor. */
export function ruleToInput(r: RuleRow): RuleInput {
  const src = ruleSource(r);
  const conds = r.conditions as StoredConditions;
  return {
    name: r.name,
    triggerKind: r.triggerKind === "schedule" ? "schedule" : "event",
    eventType: r.eventType ?? undefined,
    schedule: r.cron ? (cronToPreset(r.cron) ?? { preset: "daily", time: "09:00" }) : undefined,
    source: src ? { kind: src.kind, days: src.days } : { kind: "none" },
    conditions: { match: conds.match, items: conds.items },
    actions: r.actions as RuleInput["actions"],
    testMode: r.testMode,
    templateKey: r.templateKey ?? undefined,
  };
}

/** Descripción legible del disparador. */
export function describeTrigger(r: Pick<RuleRow, "triggerKind" | "eventType" | "cron" | "conditions">): string {
  if (r.triggerKind === "schedule") {
    const src = ruleSource(r);
    const when = r.cron ? describeCron(r.cron) : "Sin programación";
    if (!src) return when;
    const s = SCHEDULE_SOURCES[src.kind];
    const days = src.days ? ` (${src.kind === "domain_expiring" ? `en ${src.days} días o menos` : `${src.days}+ días`})` : "";
    return `${when} · ${s?.label.toLowerCase() ?? src.kind}${days}`;
  }
  return `Cuando: ${eventLabel(r.eventType)}`;
}

// ---------------------------------------------------------------------------------------------
// Disparadores: último evento real, elementos de una programación
// ---------------------------------------------------------------------------------------------

type Trigger = { eventId: string | null; event: TriggerEvent; label: string };

async function lastEventTrigger(rule: RuleRow): Promise<Trigger | null> {
  if (!rule.eventType) return null;
  const [ev] = await getDb()
    .select()
    .from(schema.domainEvent)
    .where(and(eq(schema.domainEvent.workspaceId, rule.workspaceId), eq(schema.domainEvent.type, rule.eventType)))
    .orderBy(desc(schema.domainEvent.occurredAt), desc(schema.domainEvent.id))
    .limit(1);
  if (!ev) return null;
  const [act] = ev.entityId
    ? await getDb()
        .select({ summary: schema.activity.summary })
        .from(schema.activity)
        .where(and(eq(schema.activity.workspaceId, rule.workspaceId), eq(schema.activity.verb, ev.type), eq(schema.activity.entityId, ev.entityId)))
        .orderBy(desc(schema.activity.occurredAt))
        .limit(1)
    : [];
  return {
    eventId: ev.id,
    event: { ...ev, payload: (ev.payload ?? {}) as Record<string, unknown> },
    label: act?.summary ?? eventLabel(ev.type),
  };
}

/** Elementos de una fuente "para cada" (con clave de versión para la idempotencia). */
export async function sourceItems(workspaceId: string, src: { kind: string; days?: number }, today: string, limit = 200): Promise<{ entityType: string; id: string; version: string; label: string }[]> {
  const db = getDb();
  const ws = { workspaceId };
  const days = src.days ?? 0;
  switch (src.kind) {
    case "task_overdue": {
      const rows = await db
        .select({ id: schema.task.id, title: schema.task.title, due: schema.task.dueDate })
        .from(schema.task)
        .where(
          and(
            scoped(schema.task, ws),
            sql`${schema.task.status} in ('todo','doing','waiting')`,
            sql`${schema.task.dueDate} is not null`,
            sql`${schema.task.dueDate} <= (${today}::date - ${days}::int)`,
          ),
        )
        .orderBy(schema.task.dueDate)
        .limit(limit);
      return rows.map((r) => ({ entityType: "task", id: r.id, version: String(r.due), label: r.title }));
    }
    case "opportunity_no_next_action": {
      const rows = await db
        .select({ id: schema.opportunity.id, title: schema.opportunity.title })
        .from(schema.opportunity)
        .where(
          and(
            scoped(schema.opportunity, ws),
            sql`${schema.opportunity.stage} not in ('won','lost')`,
            sql`coalesce(trim(${schema.opportunity.nextAction}), '') = ''`,
          ),
        )
        .limit(limit);
      return rows.map((r) => ({ entityType: "opportunity", id: r.id, version: "1", label: r.title }));
    }
    case "domain_expiring": {
      const rows = await db
        .select({ id: schema.domain.id, name: schema.domain.name, exp: schema.domain.expiresOn })
        .from(schema.domain)
        .where(
          and(
            scoped(schema.domain, ws),
            sql`${schema.domain.expiresOn} is not null`,
            sql`${schema.domain.expiresOn} >= ${today}::date`,
            sql`${schema.domain.expiresOn} <= (${today}::date + ${days}::int)`,
          ),
        )
        .limit(limit);
      return rows.map((r) => ({ entityType: "domain", id: r.id, version: String(r.exp), label: r.name }));
    }
    case "receivable_overdue": {
      const rows = await db
        .select({ id: schema.receivable.id, concept: schema.receivable.concept, due: schema.receivable.dueDate })
        .from(schema.receivable)
        .where(
          and(
            scoped(schema.receivable, ws),
            sql`${schema.receivable.status} in ('pending','partial','overdue')`,
            sql`${schema.receivable.dueDate} is not null`,
            sql`${schema.receivable.dueDate} <= (${today}::date - ${days}::int)`,
          ),
        )
        .limit(limit);
      return rows.map((r) => ({ entityType: "receivable", id: r.id, version: String(r.due), label: r.concept }));
    }
    default:
      return [];
  }
}

export const scheduleEventId = (ruleId: string, slot: Date) => deterministicUuid("schedule", ruleId, slot.toISOString());
export const itemEventId = (ruleId: string, entityId: string, version: string) => deterministicUuid("item", ruleId, entityId, version);

export function scheduledTrigger(rule: RuleRow, slot: Date, item?: { entityType: string; id: string; version: string; label: string }): Trigger {
  return {
    eventId: item ? itemEventId(rule.id, item.id, item.version) : scheduleEventId(rule.id, slot),
    event: {
      id: null,
      type: "automatizacion.programada",
      entityType: item?.entityType ?? "automation_rule",
      entityId: item?.id ?? rule.id,
      payload: { programada: slot.toISOString() },
      actorType: "system",
      occurredAt: slot,
    },
    label: item ? item.label : describeCron(rule.cron ?? ""),
  };
}

async function manualTriggers(rule: RuleRow, max: number): Promise<Trigger[]> {
  if (rule.triggerKind === "event") {
    const t = await lastEventTrigger(rule);
    return t ? [t] : [];
  }
  const now = new Date();
  const src = ruleSource(rule);
  if (!src) return [{ ...scheduledTrigger(rule, now), eventId: deterministicUuid("manual", rule.id, now.toISOString()) }];
  const items = await sourceItems(rule.workspaceId, src, new Date().toLocaleDateString("en-CA", { timeZone: "America/Buenos_Aires" }), max);
  return items.map((it) => scheduledTrigger(rule, now, it));
}

export type PreviewResult = { empty: true; message: string } | { empty: false; items: { label: string; result: ExecuteResult }[] };

/** Modo prueba: qué haría la regla con el último evento real de su tipo (o con los elementos actuales). No escribe nada. */
export async function previewRule(ctx: Ctx, id: string): Promise<PreviewResult> {
  assertCan(ctx, "read", R);
  const rule = await getOwnRule(getDb(), ctx, id);
  const triggers = await manualTriggers(rule, 5);
  if (!triggers.length)
    return {
      empty: true,
      message:
        rule.triggerKind === "event"
          ? `Todavía no pasó ningún «${eventLabel(rule.eventType)}» en tu espacio de trabajo.`
          : "Hoy no hay elementos que cumplan la fuente de la programación.",
    };
  const items = [];
  for (const t of triggers) items.push({ label: t.label, result: await executeRule(rule, t, { dryRun: true, persist: false }) });
  return { empty: false, items };
}

/** Ejecuta de verdad con el último evento real (idempotente: si ya corrió con ese evento, no repite). */
export async function runRuleNow(ctx: Ctx, id: string) {
  assertCan(ctx, "update", R);
  const rule = await getOwnRule(getDb(), ctx, id);
  if (!rule.active) throw validation("Activá la regla para ejecutarla");
  const triggers = await manualTriggers(rule, 50);
  if (!triggers.length) throw validation(rule.triggerKind === "event" ? `Todavía no pasó ningún «${eventLabel(rule.eventType)}».` : "No hay elementos para procesar.");
  const results: ExecuteResult[] = [];
  for (const t of triggers) results.push(await executeRule(rule, t, { dryRun: rule.testMode }));
  const fresh = results.filter((r) => !r.duplicate);
  if (!fresh.length) throw conflict("Ya se ejecutó con ese evento (cada evento dispara la regla una sola vez).");
  return { runs: fresh.length, statuses: fresh.map((r) => r.status) };
}

// ---------------------------------------------------------------------------------------------
// Webhooks (entrantes y salientes)
// ---------------------------------------------------------------------------------------------

const newSecret = () => `whsec_${randomBytes(24).toString("hex")}`;

export const endpointInput = z
  .object({
    direction: z.enum(["in", "out"]),
    name: zRequired(80, "El nombre"),
    url: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().url("URL inválida").max(500).optional()),
  })
  .refine((e) => e.direction === "in" || Boolean(e.url), { message: "La URL es obligatoria", path: ["url"] });

/** Crea un endpoint. El secreto se devuelve UNA sola vez (se guarda cifrado). */
export async function createEndpoint(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "update", R);
  const input = endpointInput.parse(raw);
  if (input.direction === "out" && input.url) {
    if (!input.url.startsWith("https://") && process.env.NODE_ENV === "production") throw validation("Usá una URL https", { url: "Solo https" });
    if (process.env.AUTOMATIONS_WEBHOOK_ALLOW_LOCAL !== "1")
      await assertPublicUrl(input.url).catch((e: Error) => {
        throw validation(e.message, { url: e.message });
      });
  }
  const secret = newSecret();
  return getDb().transaction(async (t) => {
    const [row] = await t
      .insert(schema.webhookEndpoint)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        direction: input.direction,
        name: input.name,
        url: input.direction === "out" ? (input.url ?? null) : null,
        secretEnc: encryptSecret(secret),
      })
      .returning({ id: schema.webhookEndpoint.id, name: schema.webhookEndpoint.name, direction: schema.webhookEndpoint.direction });
    if (!row) throw new Error("No se pudo crear el webhook");
    await recordEvent(t, ctx, {
      type: "webhook.creado",
      entityType: "webhook_endpoint",
      entityId: row.id,
      summary: `Creó el webhook ${row.direction === "in" ? "entrante" : "saliente"} «${row.name}»`,
    });
    await audit(t, ctx, { action: "webhook.create", targetType: "webhook_endpoint", targetId: row.id });
    return { ...row, secret };
  });
}

export async function rotateEndpointSecret(ctx: Ctx, id: string) {
  assertCan(ctx, "update", R);
  const secret = newSecret();
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.webhookEndpoint)
      .set({ secretEnc: encryptSecret(secret) })
      .where(and(eq(schema.webhookEndpoint.id, id), scoped(schema.webhookEndpoint, ctx)))
      .returning({ id: schema.webhookEndpoint.id, name: schema.webhookEndpoint.name });
    if (!row) throw notFound("El webhook");
    await recordEvent(t, ctx, { type: "webhook.secreto_rotado", entityType: "webhook_endpoint", entityId: id, summary: `Rotó el secreto del webhook «${row.name}»` });
    await audit(t, ctx, { action: "webhook.rotate_secret", targetType: "webhook_endpoint", targetId: id });
    return { id, secret };
  });
}

export async function setEndpointActive(ctx: Ctx, id: string, active: boolean) {
  assertCan(ctx, "update", R);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.webhookEndpoint)
      .set({ active: Boolean(active) })
      .where(and(eq(schema.webhookEndpoint.id, id), scoped(schema.webhookEndpoint, ctx)))
      .returning();
    if (!row) throw notFound("El webhook");
    await recordEvent(t, ctx, {
      type: "webhook.actualizado",
      entityType: "webhook_endpoint",
      entityId: id,
      summary: `${active ? "Activó" : "Pausó"} el webhook «${row.name}»`,
    });
    return row;
  });
}

export type WebhookReceipt = { status: 202 | 400 | 401 | 404 | 409 | 413; message: string; eventId?: string };
const MAX_BODY = 256 * 1024;

/**
 * Webhook entrante (docs/08 §5): firma `X-Agencyos-Signature: t=<ts>,v1=<hmac_sha256(secreto, "t.body")>`,
 * ventana anti-replay de 5 minutos, comparación en tiempo constante y rechazo de firmas repetidas.
 * Genera el evento `webhook.recibido`, que puede disparar reglas.
 */
export async function receiveWebhook(endpointId: string, rawBody: string, signature: string | null, nowS = Math.floor(Date.now() / 1000)): Promise<WebhookReceipt> {
  if (!/^[0-9a-f-]{36}$/i.test(endpointId)) return { status: 404, message: "No encontrado" };
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY) return { status: 413, message: "Cuerpo demasiado grande" };
  const db = getDb();
  const [ep] = await db
    .select()
    .from(schema.webhookEndpoint)
    .where(and(eq(schema.webhookEndpoint.id, endpointId), eq(schema.webhookEndpoint.direction, "in"), isNull(schema.webhookEndpoint.deletedAt)));
  if (!ep || !ep.active || !ep.secretEnc) return { status: 404, message: "No encontrado" };
  const check = verifyWebhookSignature(decryptSecret(ep.secretEnc), rawBody, signature, nowS);
  if (!check.ok) return { status: 401, message: check.reason === "stale" ? "Firma vencida (más de 5 minutos)" : "Firma inválida" };
  let datos: unknown;
  try {
    datos = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    datos = { texto: rawBody.slice(0, 2000) };
  }
  const marker = `sig:${check.v1}`;
  return db.transaction(async (t) => {
    // serializa por endpoint para que dos entregas simultáneas iguales no pasen las dos
    await t.execute(sql`select pg_advisory_xact_lock(hashtext(${ep.id}))`);
    const [dup] = await t
      .select({ id: schema.webhookDelivery.id })
      .from(schema.webhookDelivery)
      .where(and(eq(schema.webhookDelivery.endpointId, ep.id), eq(schema.webhookDelivery.responseExcerpt, marker)))
      .limit(1);
    if (dup) return { status: 409 as const, message: "Entrega repetida" };
    const ctx: Ctx = { workspaceId: ep.workspaceId, userId: null, role: "owner", actor: { type: "system", id: `webhook:${ep.id}`, name: `Webhook «${ep.name}»` } };
    await recordEvent(t, ctx, {
      type: "webhook.recibido",
      entityType: "webhook_endpoint",
      entityId: ep.id,
      summary: `Llegó un webhook a «${ep.name}»`,
      payload: { datos: datos as Record<string, unknown> },
    });
    const [ev] = await t
      .select({ id: schema.domainEvent.id })
      .from(schema.domainEvent)
      .where(and(eq(schema.domainEvent.workspaceId, ep.workspaceId), eq(schema.domainEvent.entityId, ep.id), eq(schema.domainEvent.type, "webhook.recibido")))
      .orderBy(desc(schema.domainEvent.occurredAt), desc(schema.domainEvent.id))
      .limit(1);
    await t.insert(schema.webhookDelivery).values({ workspaceId: ep.workspaceId, endpointId: ep.id, eventId: ev?.id ?? null, statusCode: 202, responseExcerpt: marker });
    return { status: 202 as const, message: "Recibido", eventId: ev?.id };
  });
}

// ---------------------------------------------------------------------------------------------
// Worker: eventos del outbox
// ---------------------------------------------------------------------------------------------

type DomainEventRow = typeof schema.domainEvent.$inferSelect;

/**
 * Lo llama el despachador del outbox después de cada evento. Nunca lanza.
 * Idempotente: (regla, evento) es único en automation_run. Anti-bucle: una regla no se dispara con sus propios eventos.
 */
export async function handleEvent(ev: DomainEventRow): Promise<number> {
  let n = 0;
  try {
    if (ev.type === "aprobacion.aprobada" || ev.type === "aprobacion.rechazada") await handleApprovalDecision(ev);
    const rules = await getDb()
      .select()
      .from(schema.automationRule)
      .where(
        and(
          eq(schema.automationRule.workspaceId, ev.workspaceId),
          eq(schema.automationRule.active, true),
          eq(schema.automationRule.triggerKind, "event"),
          eq(schema.automationRule.eventType, ev.type),
          isNull(schema.automationRule.deletedAt),
          isNull(schema.automationRule.archivedAt),
        ),
      );
    for (const rule of rules) {
      if (ev.actorId === AUTOMATION_ACTOR(rule.id)) continue;
      try {
        const r = await executeRule(rule, { eventId: ev.id, event: { ...ev, payload: (ev.payload ?? {}) as Record<string, unknown> } }, { dryRun: rule.testMode });
        if (!r.duplicate) n++;
      } catch (e) {
        console.error("[automatizaciones] regla", rule.id, e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error("[automatizaciones] evento", ev.id, e instanceof Error ? e.message : e);
  }
  return n;
}

/** Un email a cliente aprobado en Aprobaciones se envía acá; rechazado, se descarta. */
async function handleApprovalDecision(ev: DomainEventRow) {
  if (!ev.entityId) return;
  const db = getDb();
  const [ap] = await db
    .select()
    .from(schema.approval)
    .where(and(eq(schema.approval.id, ev.entityId), eq(schema.approval.workspaceId, ev.workspaceId)));
  if (!ap || ap.kind !== "automation_email") return;
  const prop = ap.proposal as { email?: { to: string; subject: string; text: string }; ruleId?: string; runId?: string; index?: number };
  const exec = (ap.executionResult ?? {}) as { taskId?: string; sent?: boolean };
  const approved = ev.type === "aprobacion.aprobada" && ap.status === "approved";
  let note = "El email fue rechazado en Aprobaciones";
  let ok = false;
  if (approved) {
    if (exec.sent || !prop.email) return;
    const { sendEmail } = await import("../shared/email");
    ok = await sendEmail(prop.email);
    note = ok ? `Email enviado a ${prop.email.to} (aprobado)` : "Aprobado, pero no se pudo enviar (revisá Brevo)";
    await db
      .update(schema.approval)
      .set({ executionResult: { ...exec, sent: ok, sentAt: ok ? new Date().toISOString() : undefined, error: ok ? undefined : note } })
      .where(eq(schema.approval.id, ap.id));
    // la aprobación genérica deja una tarea "Aplicar: …": si el envío salió, ya está aplicada
    if (ok && exec.taskId && prop.ruleId) {
      const [rule] = await db.select().from(schema.automationRule).where(eq(schema.automationRule.id, prop.ruleId));
      const role = rule ? await creatorRole(db, rule.workspaceId, rule.createdBy) : null;
      if (rule && role) await setTaskStatus(automationCtx(rule, role), exec.taskId, "done").catch(() => undefined);
    }
  }
  if (!prop.runId) return;
  const [run] = await db.select().from(schema.automationRun).where(and(eq(schema.automationRun.id, prop.runId), eq(schema.automationRun.workspaceId, ev.workspaceId)));
  if (!run) return;
  const out = (run.output ?? { step: 0, results: [] }) as RunOutput;
  const results = (out.results ?? []).map((r) => (r.index === prop.index ? { ...r, summary: note, ok: approved ? ok : true, pendingApproval: false } : r));
  const stillPending = results.some((r) => r.pendingApproval);
  const status = run.status !== "waiting_approval" || stillPending ? run.status : approved && !ok ? "failed" : "succeeded";
  await db
    .update(schema.automationRun)
    .set({ output: { ...out, results }, status, error: approved && !ok ? note : run.error })
    .where(eq(schema.automationRun.id, run.id));
}
