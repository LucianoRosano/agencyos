import {
  addDays, assertCan, type Ctx, conflict, formatMoney, fromCents, L, label, notFound, systemCtx, toCents, todayAR, validation, zBool, zCurrency, zDate, zMoney,
  zOptMoney, zOptUuid, zRequired,
} from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema, type Tx } from "@agencyos/db";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { createFromTemplate } from "../projects/service";
import { getDb, scoped } from "../shared/db";
import { calcQuote, DISCOUNT_TYPES, type PaymentPlan, paymentSchedule, planIssues } from "./calc";

export const SERVICE_UNITS = ["project", "hour", "month", "page", "product", "item"] as const;
export const QUOTE_STATUSES = ["draft", "sent", "viewed", "accepted", "rejected", "expired", "void"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
/** Texto opcional: "" → undefined (zOptText de core falla con strings vacíos en Zod 4). */
const zOptStr = (max: number) => z.preprocess(emptyToUndef, z.string().trim().max(max, `Máximo ${max} caracteres`).optional());
const emptyToZero = (v: unknown) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? "0" : v);

// --- Catálogo de servicios ---

export const serviceInput = z
  .object({
    name: zRequired(160, "El nombre"),
    descriptionMd: zOptStr(20000),
    deliverablesMd: zOptStr(20000),
    unit: z.enum(SERVICE_UNITS, { error: "Unidad inválida" }).default("project"),
    priceArs: zOptMoney,
    priceUsd: zOptMoney,
    projectTemplateId: zOptUuid,
    /** Sin dato → activo. El formulario manda "false" (oculto) y "on" (casilla). */
    active: z.preprocess((v) => (v === undefined ? true : v), zBool),
  });

async function assertTemplate(t: Tx, ctx: Ctx, id: string | undefined) {
  if (!id) return;
  const [tpl] = await t.select({ id: schema.projectTemplate.id }).from(schema.projectTemplate).where(and(eq(schema.projectTemplate.id, id), scoped(schema.projectTemplate, ctx)));
  if (!tpl) throw validation("La plantilla de proyecto no existe", { projectTemplateId: "Elegí una plantilla válida" });
}

export async function createService(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "service");
  const input = serviceInput.parse(raw);
  return getDb().transaction(async (t) => {
    await assertTemplate(t, ctx, input.projectTemplateId);
    const [row] = await t
      .insert(schema.service)
      .values({ ...input, priceArs: input.priceArs ?? null, priceUsd: input.priceUsd ?? null, projectTemplateId: input.projectTemplateId ?? null, workspaceId: ctx.workspaceId, createdBy: ctx.userId })
      .returning();
    if (!row) throw new Error("No se pudo crear el servicio");
    await recordEvent(t, ctx, { type: "servicio.creado", entityType: "service", entityId: row.id, summary: `Agregó el servicio «${row.name}» al catálogo` });
    return row;
  });
}

export async function updateService(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "service");
  const input = serviceInput.parse(raw);
  return getDb().transaction(async (t) => {
    await assertTemplate(t, ctx, input.projectTemplateId);
    const [row] = await t
      .update(schema.service)
      .set({
        ...input,
        descriptionMd: input.descriptionMd ?? null,
        deliverablesMd: input.deliverablesMd ?? null,
        priceArs: input.priceArs ?? null,
        priceUsd: input.priceUsd ?? null,
        projectTemplateId: input.projectTemplateId ?? null,
      })
      .where(and(eq(schema.service.id, id), scoped(schema.service, ctx)))
      .returning();
    if (!row) throw notFound("El servicio");
    await recordEvent(t, ctx, { type: "servicio.actualizado", entityType: "service", entityId: id, summary: `Editó el servicio «${row.name}»` });
    return row;
  });
}

export async function setServiceActive(ctx: Ctx, id: string, active: boolean) {
  assertCan(ctx, "update", "service");
  return getDb().transaction(async (t) => {
    const [row] = await t.update(schema.service).set({ active }).where(and(eq(schema.service.id, id), scoped(schema.service, ctx))).returning();
    if (!row) throw notFound("El servicio");
    await recordEvent(t, ctx, { type: "servicio.actualizado", entityType: "service", entityId: id, summary: `${active ? "Activó" : "Desactivó"} el servicio «${row.name}»` });
    return row;
  });
}

// --- Presupuestos: validación ---

/** Cantidad decimal > 0 (hasta 2 decimales, acepta coma). */
const zQuantity = zMoney.refine((v) => toCents(v) > 0n, "La cantidad debe ser mayor a cero");
const zPercentOrAmount = z.preprocess(emptyToZero, zMoney);

export const quoteItemInput = z
  .object({
    serviceId: zOptUuid,
    description: zRequired(500, "La descripción"),
    quantity: z.preprocess(emptyToUndef, zQuantity.optional()).transform((v) => v ?? "1.00"),
    unit: z.preprocess(emptyToUndef, z.enum(SERVICE_UNITS).optional()),
    unitPrice: z.preprocess((v) => (v === undefined || v === null ? "" : v), zMoney),
    discountType: z.enum(DISCOUNT_TYPES).default("none"),
    discountValue: zPercentOrAmount,
  })
  .superRefine((v, c) => {
    if (v.discountType === "percent" && toCents(v.discountValue) > 10000n) c.addIssue({ code: "custom", path: ["discountValue"], message: "El descuento no puede superar el 100 %" });
  });

const zOffset = z.preprocess(emptyToUndef, z.coerce.number().int("Días enteros").min(0, "No puede ser negativo").max(3650).optional());

export const paymentPlanInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("single") }),
  z.object({
    kind: z.literal("milestones"),
    items: z
      .array(z.object({ label: zRequired(80, "La etapa"), percent: z.coerce.number({ error: "Porcentaje inválido" }).gt(0, "Debe ser mayor a cero").max(100, "Máximo 100"), offsetDays: zOffset }))
      .min(1, "Agregá al menos una etapa")
      .max(12, "Máximo 12 etapas"),
  }),
  z.object({
    kind: z.literal("monthly"),
    amount: z.preprocess((v) => (v === undefined || v === null ? "" : v), zMoney).refine((v) => toCents(v) > 0n, "El monto mensual debe ser mayor a cero"),
    months: z.preprocess((v) => (v === undefined || v === null || v === "" ? null : v), z.coerce.number().int("Meses enteros").min(1, "Mínimo 1 mes").max(120, "Máximo 120").nullable()),
  }),
]);

const zRate = z.preprocess(
  (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.trim().replace(",", ".")) : v),
  z
    .union([z.string(), z.number()])
    .transform(String)
    .refine((v) => /^\d+(\.\d{1,4})?$/.test(v) && Number(v) > 0, "Tipo de cambio inválido")
    .optional(),
);

export const quoteInput = z
  .object({
    clientId: z.preprocess(emptyToUndef, z.string({ error: "Elegí el cliente" }).uuid("Elegí el cliente")),
    contactId: zOptUuid,
    opportunityId: zOptUuid,
    title: zRequired(200, "El título"),
    currency: zCurrency,
    exchangeRateRef: zRate,
    issueDate: zDate,
    validUntil: zDate,
    introMd: zOptStr(20000),
    scopeMd: zOptStr(20000),
    exclusionsMd: zOptStr(20000),
    termsMd: zOptStr(20000),
    notesMd: zOptStr(20000),
    items: z.array(quoteItemInput, { error: "Agregá al menos un ítem" }).min(1, "Agregá al menos un ítem").max(100, "Máximo 100 ítems"),
    globalDiscountType: z.enum(DISCOUNT_TYPES).default("none"),
    globalDiscountValue: zPercentOrAmount,
    paymentPlan: paymentPlanInput.default({ kind: "single" }),
  })
  .superRefine((v, c) => {
    if (v.validUntil < v.issueDate) c.addIssue({ code: "custom", path: ["validUntil"], message: "La validez es anterior a la fecha del presupuesto" });
    const totals = calcQuote(v);
    for (const i of totals.issues) c.addIssue({ code: "custom", path: i.path.split("."), message: i.message });
    for (const i of planIssues(v.paymentPlan as PaymentPlan)) c.addIssue({ code: "custom", path: i.path.split("."), message: i.message });
  });
export type QuoteInput = z.infer<typeof quoteInput>;

// --- Presupuestos: helpers ---

/** Número correlativo por workspace y año: `UPDATE … RETURNING` bloquea la fila del workspace hasta el commit. */
async function nextQuoteNumber(t: Tx, ctx: Ctx, year: string): Promise<string> {
  const [row] = await t
    .update(schema.workspace)
    .set({
      quoteSeq: sql`jsonb_set(${schema.workspace.quoteSeq}, ARRAY[${year}]::text[], to_jsonb(coalesce((${schema.workspace.quoteSeq}->>${year})::int, 0) + 1))`,
      updatedAt: new Date(),
    })
    .where(eq(schema.workspace.id, ctx.workspaceId))
    .returning({ n: sql<number>`(${schema.workspace.quoteSeq}->>${year})::int` });
  if (!row) throw notFound("El workspace");
  return `P-${year}-${String(row.n).padStart(4, "0")}`;
}

async function assertLinks(t: Tx, ctx: Ctx, input: Pick<QuoteInput, "clientId" | "contactId" | "opportunityId">) {
  const [c] = await t.select({ id: schema.client.id }).from(schema.client).where(and(eq(schema.client.id, input.clientId), scoped(schema.client, ctx)));
  if (!c) throw validation("El cliente no existe", { clientId: "Elegí un cliente válido" });
  if (input.contactId) {
    const [ct] = await t.select({ id: schema.contact.id }).from(schema.contact).where(and(eq(schema.contact.id, input.contactId), scoped(schema.contact, ctx)));
    if (!ct) throw validation("El contacto no existe", { contactId: "Elegí un contacto válido" });
  }
  if (input.opportunityId) {
    const [o] = await t.select({ id: schema.opportunity.id, clientId: schema.opportunity.clientId }).from(schema.opportunity).where(and(eq(schema.opportunity.id, input.opportunityId), scoped(schema.opportunity, ctx)));
    if (!o) throw validation("La oportunidad no existe", { opportunityId: "Elegí una oportunidad válida" });
    if (o.clientId !== input.clientId) throw validation("La oportunidad es de otro cliente", { opportunityId: "La oportunidad es de otro cliente" });
  }
}

function versionValues(input: QuoteInput) {
  const totals = calcQuote(input);
  return {
    totals,
    values: {
      currency: input.currency,
      exchangeRateRef: input.exchangeRateRef ?? null,
      issueDate: input.issueDate,
      validUntil: input.validUntil,
      introMd: input.introMd ?? null,
      scopeMd: input.scopeMd ?? null,
      exclusionsMd: input.exclusionsMd ?? null,
      termsMd: input.termsMd ?? null,
      notesMd: input.notesMd ?? null,
      paymentPlan: input.paymentPlan as PaymentPlan,
      globalDiscountType: input.globalDiscountType,
      globalDiscountValue: input.globalDiscountType === "none" ? "0" : input.globalDiscountValue,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
    },
  };
}

async function insertItems(t: Tx, ctx: Ctx, versionId: string, input: QuoteInput, lineTotals: string[]) {
  if (input.items.length && input.items.some((it) => it.serviceId)) {
    const ids = [...new Set(input.items.map((it) => it.serviceId).filter(Boolean) as string[])];
    const found = await t.select({ id: schema.service.id }).from(schema.service).where(and(inArray(schema.service.id, ids), scoped(schema.service, ctx, { withArchived: true })));
    if (found.length !== ids.length) throw validation("Hay un servicio que no existe", { items: "Revisá los servicios elegidos" });
  }
  await t.insert(schema.quoteItem).values(
    input.items.map((it, i) => ({
      workspaceId: ctx.workspaceId,
      createdBy: ctx.userId,
      quoteVersionId: versionId,
      serviceId: it.serviceId ?? null,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit ?? null,
      unitPrice: it.unitPrice,
      discountType: it.discountType,
      discountValue: it.discountType === "none" ? "0" : it.discountValue,
      lineTotal: lineTotals[i] ?? "0",
      sort: i,
    })),
  );
}

async function loadQuote(t: Tx, ctx: Ctx, id: string) {
  const [q] = await t.select().from(schema.quote).where(and(eq(schema.quote.id, id), scoped(schema.quote, ctx))).for("update");
  if (!q) throw notFound("El presupuesto");
  if (!q.currentVersionId) throw notFound("La versión del presupuesto");
  const [v] = await t.select().from(schema.quoteVersion).where(and(eq(schema.quoteVersion.id, q.currentVersionId), scoped(schema.quoteVersion, ctx)));
  if (!v) throw notFound("La versión del presupuesto");
  return { q, v };
}

const money = (amount: string, currency: string) => formatMoney(amount, currency);

// --- Presupuestos: casos de uso ---

export async function createQuote(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "quote");
  const input = quoteInput.parse(raw);
  return getDb().transaction(async (t) => {
    await assertLinks(t, ctx, input);
    const number = await nextQuoteNumber(t, ctx, todayAR().slice(0, 4));
    const [q] = await t
      .insert(schema.quote)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, number, clientId: input.clientId, contactId: input.contactId ?? null, opportunityId: input.opportunityId ?? null, title: input.title, status: "draft" })
      .returning();
    if (!q) throw new Error("No se pudo crear el presupuesto");
    const { totals, values } = versionValues(input);
    const [v] = await t.insert(schema.quoteVersion).values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, quoteId: q.id, version: 1, ...values }).returning();
    if (!v) throw new Error("No se pudo crear la versión");
    await insertItems(t, ctx, v.id, input, totals.lines.map((l) => l.lineTotal));
    const [row] = await t.update(schema.quote).set({ currentVersionId: v.id }).where(eq(schema.quote.id, q.id)).returning();
    await recordEvent(t, ctx, {
      type: "presupuesto.creado",
      entityType: "quote",
      entityId: q.id,
      summary: `Creó el presupuesto ${number} «${q.title}» por ${money(totals.total, input.currency)}`,
      payload: { number, total: totals.total, currency: input.currency },
    });
    return row ?? q;
  });
}

/** Edita la versión actual. Solo en borrador: un presupuesto enviado no se edita, se versiona. */
export async function updateQuote(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "quote");
  const input = quoteInput.parse(raw);
  return getDb().transaction(async (t) => {
    const { q, v } = await loadQuote(t, ctx, id);
    if (q.status !== "draft" || v.lockedAt) throw conflict("Un presupuesto enviado no se edita: creá una nueva versión.");
    await assertLinks(t, ctx, input);
    const { totals, values } = versionValues(input);
    await t.update(schema.quoteVersion).set(values).where(eq(schema.quoteVersion.id, v.id));
    await t.delete(schema.quoteItem).where(and(eq(schema.quoteItem.quoteVersionId, v.id), eq(schema.quoteItem.workspaceId, ctx.workspaceId)));
    await insertItems(t, ctx, v.id, input, totals.lines.map((l) => l.lineTotal));
    const [row] = await t
      .update(schema.quote)
      .set({ clientId: input.clientId, contactId: input.contactId ?? null, opportunityId: input.opportunityId ?? null, title: input.title })
      .where(eq(schema.quote.id, id))
      .returning();
    await recordEvent(t, ctx, {
      type: "presupuesto.actualizado",
      entityType: "quote",
      entityId: id,
      summary: `Editó ${q.number} v${v.version} · total ${money(totals.total, input.currency)}`,
      payload: { version: v.version, total: totals.total },
    });
    return row;
  });
}

/** Nueva versión (v2, v3…) copiando la actual; la anterior queda de solo lectura. */
export async function createNewVersion(ctx: Ctx, id: string) {
  assertCan(ctx, "update", "quote");
  return getDb().transaction(async (t) => {
    const { q, v } = await loadQuote(t, ctx, id);
    if (q.status === "draft" && !v.lockedAt) throw conflict("La versión actual todavía es un borrador: editala directamente.");
    if (q.status === "accepted" || q.status === "void") throw conflict(`Un presupuesto ${label(L.quoteStatus, q.status).toLowerCase()} no admite nuevas versiones.`);
    const [{ max } = { max: v.version }] = await t.select({ max: sql<number>`max(${schema.quoteVersion.version})::int` }).from(schema.quoteVersion).where(eq(schema.quoteVersion.quoteId, id));
    const now = new Date();
    if (!v.lockedAt) await t.update(schema.quoteVersion).set({ lockedAt: now }).where(eq(schema.quoteVersion.id, v.id));
    const today = todayAR();
    const validDays = Math.max(1, Math.round((Date.parse(v.validUntil) - Date.parse(v.issueDate)) / 86_400_000));
    const { id: _id, createdAt: _c, updatedAt: _u, lockedAt: _l, version: _v, createdBy: _cb, ...copy } = v;
    const [nv] = await t
      .insert(schema.quoteVersion)
      .values({ ...copy, createdBy: ctx.userId, version: max + 1, issueDate: today, validUntil: addDays(today, validDays), lockedAt: null })
      .returning();
    if (!nv) throw new Error("No se pudo crear la versión");
    const items = await t.select().from(schema.quoteItem).where(and(eq(schema.quoteItem.quoteVersionId, v.id), scoped(schema.quoteItem, ctx))).orderBy(asc(schema.quoteItem.sort));
    if (items.length) {
      await t.insert(schema.quoteItem).values(
        items.map(({ id: _i, createdAt: _a, updatedAt: _b, ...it }) => ({ ...it, createdBy: ctx.userId, quoteVersionId: nv.id })),
      );
    }
    const [row] = await t.update(schema.quote).set({ currentVersionId: nv.id, status: "draft", decidedAt: null }).where(eq(schema.quote.id, id)).returning();
    await recordEvent(t, ctx, { type: "presupuesto.nueva_version", entityType: "quote", entityId: id, summary: `Creó la versión v${nv.version} de ${q.number} (la v${v.version} queda de solo lectura)`, payload: { from: v.version, to: nv.version } });
    return { quote: row, version: nv };
  });
}

/** Marca como enviado: valida la validez, bloquea la versión y mueve la oportunidad a «Propuesta enviada». */
export async function markSent(ctx: Ctx, id: string) {
  assertCan(ctx, "update", "quote");
  return getDb().transaction(async (t) => {
    const { q, v } = await loadQuote(t, ctx, id);
    if (q.status !== "draft") throw conflict(`El presupuesto ya está ${label(L.quoteStatus, q.status).toLowerCase()}.`);
    if (v.validUntil < todayAR()) throw validation("La validez ya pasó: actualizá la fecha «válido hasta» antes de enviarlo.", { validUntil: "Debe ser hoy o posterior" });
    const [{ n } = { n: 0 }] = await t.select({ n: sql<number>`count(*)::int` }).from(schema.quoteItem).where(and(eq(schema.quoteItem.quoteVersionId, v.id), scoped(schema.quoteItem, ctx)));
    if (!n) throw validation("Agregá al menos un ítem antes de enviarlo.");
    const now = new Date();
    await t.update(schema.quoteVersion).set({ lockedAt: now }).where(eq(schema.quoteVersion.id, v.id));
    const [row] = await t.update(schema.quote).set({ status: "sent", sentAt: now }).where(eq(schema.quote.id, id)).returning();
    if (q.opportunityId) {
      await t
        .update(schema.opportunity)
        .set({ stage: "proposal_sent" })
        .where(and(eq(schema.opportunity.id, q.opportunityId), scoped(schema.opportunity, ctx), sql`${schema.opportunity.stage} not in ('won','lost')`));
    }
    await recordEvent(t, ctx, { type: "presupuesto.enviado", entityType: "quote", entityId: id, summary: `Envió ${q.number} v${v.version} «${q.title}» (${money(v.total, v.currency)})`, payload: { version: v.version } });
    return row;
  });
}

export async function markViewed(ctx: Ctx, id: string) {
  assertCan(ctx, "update", "quote");
  return getDb().transaction(async (t) => {
    const { q } = await loadQuote(t, ctx, id);
    if (q.status !== "sent") throw conflict("Solo un presupuesto enviado puede marcarse como visto.");
    const [row] = await t.update(schema.quote).set({ status: "viewed", viewedAt: new Date() }).where(eq(schema.quote.id, id)).returning();
    await recordEvent(t, ctx, { type: "presupuesto.visto", entityType: "quote", entityId: id, summary: `El cliente vio ${q.number}` });
    return row;
  });
}

export const acceptInput = z.object({
  createProject: zBool.default(false),
  createReceivables: zBool.default(false),
  markOpportunityWon: zBool.default(false),
  acceptedOn: z.preprocess(emptyToUndef, zDate.optional()),
});

/** Plantilla de proyecto: la del servicio principal (primer ítem con servicio que tenga plantilla) o «En blanco». */
async function templateForQuote(t: Tx, ctx: Ctx, versionId: string) {
  const rows = await t
    .select({ templateId: schema.service.projectTemplateId })
    .from(schema.quoteItem)
    .innerJoin(schema.service, eq(schema.service.id, schema.quoteItem.serviceId))
    .where(and(eq(schema.quoteItem.quoteVersionId, versionId), scoped(schema.quoteItem, ctx), sql`${schema.service.projectTemplateId} is not null`))
    .orderBy(asc(schema.quoteItem.sort));
  for (const r of rows) {
    if (!r.templateId) continue;
    const [tpl] = await t.select().from(schema.projectTemplate).where(and(eq(schema.projectTemplate.id, r.templateId), scoped(schema.projectTemplate, ctx)));
    if (tpl) return tpl;
  }
  const [blank] = await t.select().from(schema.projectTemplate).where(and(eq(schema.projectTemplate.key, "en-blanco"), scoped(schema.projectTemplate, ctx)));
  if (blank) return blank;
  const [any] = await t.select().from(schema.projectTemplate).where(scoped(schema.projectTemplate, ctx)).orderBy(asc(schema.projectTemplate.sort)).limit(1);
  if (!any) throw notFound("La plantilla de proyecto");
  return any;
}

/**
 * Aceptación manual. En una sola transacción y según las casillas:
 * (a) crea el proyecto con su plantilla, (b) crea los cobros pendientes según el plan
 * (se insertan en `receivable`, que lee el módulo de finanzas) y (c) marca la oportunidad como ganada.
 */
export async function acceptQuote(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "quote");
  const opts = acceptInput.parse(raw ?? {});
  if (opts.createReceivables) assertCan(ctx, "create", "finance");
  if (opts.createProject) assertCan(ctx, "create", "project");
  if (opts.markOpportunityWon) assertCan(ctx, "update", "crm");
  return getDb().transaction(async (t) => {
    const { q, v } = await loadQuote(t, ctx, id);
    if (!["sent", "viewed", "expired"].includes(q.status)) {
      throw conflict(q.status === "draft" ? "Marcá el presupuesto como enviado antes de aceptarlo." : `El presupuesto ya está ${label(L.quoteStatus, q.status).toLowerCase()}.`);
    }
    const start = opts.acceptedOn ?? todayAR();
    const now = new Date();
    if (!v.lockedAt) await t.update(schema.quoteVersion).set({ lockedAt: now }).where(eq(schema.quoteVersion.id, v.id));

    let projectId = q.projectId;
    if (opts.createProject && !projectId) {
      const tpl = await templateForQuote(t, ctx, v.id);
      const p = await createFromTemplate(
        ctx,
        { templateId: tpl.id, name: q.title, clientId: q.clientId, definitionOfDone: q.title, firstAction: "Kickoff con el cliente", quoteId: q.id, startDate: start },
        t,
      );
      projectId = p.id;
    }

    const receivables: (typeof schema.receivable.$inferSelect)[] = [];
    if (opts.createReceivables) {
      const schedule = paymentSchedule(v.paymentPlan, v.total, start);
      if (schedule.some((s) => toCents(s.amount) > 0n)) {
        const rows = await t
          .insert(schema.receivable)
          .values(
            schedule
              .filter((s) => toCents(s.amount) > 0n)
              .map((s) => ({
                workspaceId: ctx.workspaceId,
                createdBy: ctx.userId,
                clientId: q.clientId,
                projectId: projectId ?? null,
                quoteId: q.id,
                concept: `${q.number} · ${s.label}${s.percent !== null && v.paymentPlan.kind === "milestones" ? ` (${s.percent} %)` : ""}`,
                amount: s.amount,
                currency: v.currency,
                dueDate: s.dueDate,
                status: "pending",
              })),
          )
          .returning();
        receivables.push(...rows);
      }
    }

    if (opts.markOpportunityWon && q.opportunityId) {
      await t
        .update(schema.opportunity)
        .set({ stage: "won", wonAt: now, probability: 100, lostAt: null, lostReason: null })
        .where(and(eq(schema.opportunity.id, q.opportunityId), scoped(schema.opportunity, ctx)));
    }

    const [row] = await t.update(schema.quote).set({ status: "accepted", decidedAt: now, projectId: projectId ?? null }).where(eq(schema.quote.id, id)).returning();
    const extras = [projectId && opts.createProject ? "proyecto creado" : null, receivables.length ? `${receivables.length} cobro${receivables.length === 1 ? "" : "s"} pendiente${receivables.length === 1 ? "" : "s"}` : null, opts.markOpportunityWon && q.opportunityId ? "oportunidad ganada" : null].filter(Boolean);
    await recordEvent(t, ctx, {
      type: "presupuesto.aceptado",
      entityType: "quote",
      entityId: id,
      summary: `Aceptado ${q.number} v${v.version} por ${money(v.total, v.currency)}${extras.length ? ` · ${extras.join(" · ")}` : ""}`,
      payload: { version: v.version, total: v.total, projectId, receivableIds: receivables.map((r) => r.id) },
    });
    return { quote: row, projectId, receivables };
  });
}

export async function rejectQuote(ctx: Ctx, id: string, reason?: string | null) {
  assertCan(ctx, "update", "quote");
  const why = zOptStr(500).parse(reason ?? undefined);
  return getDb().transaction(async (t) => {
    const { q } = await loadQuote(t, ctx, id);
    if (!["sent", "viewed", "expired"].includes(q.status)) throw conflict("Solo se puede rechazar un presupuesto enviado.");
    const [row] = await t.update(schema.quote).set({ status: "rejected", decidedAt: new Date() }).where(eq(schema.quote.id, id)).returning();
    await recordEvent(t, ctx, { type: "presupuesto.rechazado", entityType: "quote", entityId: id, summary: `Rechazado ${q.number}${why ? `: ${why}` : ""}`, payload: { reason: why ?? null } });
    return row;
  });
}

export async function voidQuote(ctx: Ctx, id: string) {
  assertCan(ctx, "update", "quote");
  return getDb().transaction(async (t) => {
    const { q, v } = await loadQuote(t, ctx, id);
    if (q.status === "accepted" || q.status === "void") throw conflict(`Un presupuesto ${label(L.quoteStatus, q.status).toLowerCase()} no se puede anular.`);
    if (!v.lockedAt) await t.update(schema.quoteVersion).set({ lockedAt: new Date() }).where(eq(schema.quoteVersion.id, v.id));
    const [row] = await t.update(schema.quote).set({ status: "void", decidedAt: new Date() }).where(eq(schema.quote.id, id)).returning();
    await recordEvent(t, ctx, { type: "presupuesto.anulado", entityType: "quote", entityId: id, summary: `Anuló ${q.number}`, payload: { from: q.status } });
    return row;
  });
}

/**
 * Job diario: pasa a «vencido» los enviados/vistos cuya versión actual tiene `validUntil < hoy`.
 * Recorre todos los workspaces (o uno, si se indica). Devuelve los presupuestos vencidos.
 */
export async function expireQuotes(today: string = todayAR(), workspaceId?: string) {
  const day = zDate.parse(today);
  return getDb().transaction(async (t) => {
    const due = await t
      .select({ id: schema.quote.id, workspaceId: schema.quote.workspaceId, number: schema.quote.number, validUntil: schema.quoteVersion.validUntil })
      .from(schema.quote)
      .innerJoin(schema.quoteVersion, eq(schema.quoteVersion.id, schema.quote.currentVersionId))
      .where(
        and(
          inArray(schema.quote.status, ["sent", "viewed"]),
          lt(schema.quoteVersion.validUntil, day),
          sql`${schema.quote.deletedAt} is null`,
          workspaceId ? eq(schema.quote.workspaceId, workspaceId) : undefined,
        ),
      )
      .for("update", { of: schema.quote });
    for (const d of due) {
      await t.update(schema.quote).set({ status: "expired" }).where(eq(schema.quote.id, d.id));
      await recordEvent(t, systemCtx(d.workspaceId), { type: "presupuesto.vencido", entityType: "quote", entityId: d.id, summary: `Venció ${d.number} (válido hasta ${d.validUntil})`, payload: { validUntil: d.validUntil } });
    }
    return due;
  });
}

/** Total de una lista de importes (útil para la UI del diálogo de aceptación). */
export const sumAmounts = (vals: string[]) => fromCents(vals.reduce((a, v) => a + toCents(v), 0n));
