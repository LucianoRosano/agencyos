import { addDays, type Ctx, formatDate, formatMoney, L, label, todayAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import type { WorkspaceSettings } from "@agencyos/db/schema";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";
import { calcQuote, discountAmount, type PaymentPlan, paymentSchedule } from "./calc";

// --- Marca hacia el cliente ---

const DEFAULT_BRAND = { name: "Luciano Rosano", email: "lucianorosanott@gmail.com", phone: "11 5526-0021" };

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "LR";

/** Datos de la marca para PDFs y textos al cliente. Los valores por defecto solo se usan si la configuración está vacía. */
export function brandFromSettings(s: WorkspaceSettings | null | undefined) {
  const empty = !s?.agencyName && !s?.agencyEmail && !s?.agencyPhone;
  const name = (empty ? DEFAULT_BRAND.name : s?.agencyName) || DEFAULT_BRAND.name;
  return {
    name,
    initials: initialsOf(name),
    email: (empty ? DEFAULT_BRAND.email : s?.agencyEmail) || null,
    phone: (empty ? DEFAULT_BRAND.phone : s?.agencyPhone) || null,
    website: s?.agencyWebsite || null,
    city: s?.agencyCity || null,
    footer: s?.quoteFooter || null,
  };
}

async function workspaceSettings(ctx: Ctx) {
  const [w] = await getDb().select({ settings: schema.workspace.settings }).from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId));
  return w?.settings ?? {};
}

// --- Servicios ---

export async function listServices(ctx: Ctx, f: { includeInactive?: boolean; q?: string } = {}) {
  const where = [scoped(schema.service, ctx)];
  if (!f.includeInactive) where.push(eq(schema.service.active, true));
  if (f.q) where.push(sql`f_search_norm(${schema.service.name}) like '%' || f_search_norm(${f.q}) || '%'`);
  return getDb()
    .select({ s: schema.service, templateName: schema.projectTemplate.name })
    .from(schema.service)
    .leftJoin(schema.projectTemplate, eq(schema.projectTemplate.id, schema.service.projectTemplateId))
    .where(and(...where))
    .orderBy(desc(schema.service.active), asc(schema.service.name));
}

// --- Presupuestos ---

export type QuoteFilters = { status?: string; q?: string; clientId?: string };

export async function listQuotes(ctx: Ctx, f: QuoteFilters = {}) {
  const where = [scoped(schema.quote, ctx)];
  if (f.status === "abiertos") where.push(inArray(schema.quote.status, ["draft", "sent", "viewed"]));
  else if (f.status) where.push(eq(schema.quote.status, f.status));
  if (f.clientId) where.push(eq(schema.quote.clientId, f.clientId));
  if (f.q) where.push(sql`(f_search_norm(${schema.quote.title}) like '%' || f_search_norm(${f.q}) || '%' or ${schema.quote.number} ilike '%' || ${f.q} || '%' or f_search_norm(${schema.client.name}) like '%' || f_search_norm(${f.q}) || '%')`);
  return getDb()
    .select({
      q: schema.quote,
      clientName: schema.client.name,
      version: schema.quoteVersion.version,
      currency: schema.quoteVersion.currency,
      total: schema.quoteVersion.total,
      validUntil: schema.quoteVersion.validUntil,
      issueDate: schema.quoteVersion.issueDate,
    })
    .from(schema.quote)
    .leftJoin(schema.client, eq(schema.client.id, schema.quote.clientId))
    .leftJoin(schema.quoteVersion, eq(schema.quoteVersion.id, schema.quote.currentVersionId))
    .where(and(...where))
    .orderBy(desc(schema.quote.updatedAt))
    .limit(500);
}

export async function quoteCounts(ctx: Ctx) {
  const rows = await getDb().select({ status: schema.quote.status, n: sql<number>`count(*)::int` }).from(schema.quote).where(scoped(schema.quote, ctx)).groupBy(schema.quote.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

export async function getQuote(ctx: Ctx, id: string) {
  const db = getDb();
  const [row] = await db
    .select({ q: schema.quote, clientName: schema.client.name, contactName: schema.contact.name, opportunityTitle: schema.opportunity.title, opportunityStage: schema.opportunity.stage, projectName: schema.project.name })
    .from(schema.quote)
    .leftJoin(schema.client, eq(schema.client.id, schema.quote.clientId))
    .leftJoin(schema.contact, eq(schema.contact.id, schema.quote.contactId))
    .leftJoin(schema.opportunity, eq(schema.opportunity.id, schema.quote.opportunityId))
    .leftJoin(schema.project, eq(schema.project.id, schema.quote.projectId))
    .where(and(eq(schema.quote.id, id), scoped(schema.quote, ctx)));
  if (!row) return null;
  const versions = await db.select().from(schema.quoteVersion).where(and(eq(schema.quoteVersion.quoteId, id), scoped(schema.quoteVersion, ctx))).orderBy(desc(schema.quoteVersion.version));
  const items = versions.length
    ? await db.select().from(schema.quoteItem).where(and(inArray(schema.quoteItem.quoteVersionId, versions.map((v) => v.id)), scoped(schema.quoteItem, ctx))).orderBy(asc(schema.quoteItem.sort))
    : [];
  const current = versions.find((v) => v.id === row.q.currentVersionId) ?? versions[0] ?? null;
  const receivables = await db.select().from(schema.receivable).where(and(eq(schema.receivable.quoteId, id), scoped(schema.receivable, ctx))).orderBy(asc(schema.receivable.dueDate));
  return {
    ...row,
    current,
    versions: versions.map((v) => ({ ...v, items: items.filter((i) => i.quoteVersionId === v.id) })),
    receivables,
  };
}
export type QuoteDetail = NonNullable<Awaited<ReturnType<typeof getQuote>>>;

/** Opciones del editor: clientes, contactos (con sus clientes), oportunidades abiertas, servicios activos y plantilla por defecto. */
export async function editorOptions(ctx: Ctx) {
  const db = getDb();
  const [clients, contacts, links, opportunities, services, templates] = await Promise.all([
    db.select({ id: schema.client.id, name: schema.client.name }).from(schema.client).where(and(scoped(schema.client, ctx), notInArray(schema.client.status, ["archived"]))).orderBy(asc(schema.client.name)),
    db.select({ id: schema.contact.id, name: schema.contact.name }).from(schema.contact).where(scoped(schema.contact, ctx)).orderBy(asc(schema.contact.name)),
    db.select({ clientId: schema.clientContact.clientId, contactId: schema.clientContact.contactId }).from(schema.clientContact).where(eq(schema.clientContact.workspaceId, ctx.workspaceId)),
    db
      .select({ id: schema.opportunity.id, title: schema.opportunity.title, clientId: schema.opportunity.clientId, stage: schema.opportunity.stage })
      .from(schema.opportunity)
      .where(scoped(schema.opportunity, ctx))
      .orderBy(desc(schema.opportunity.updatedAt)),
    db.select().from(schema.service).where(and(scoped(schema.service, ctx), eq(schema.service.active, true))).orderBy(asc(schema.service.name)),
    db.select().from(schema.quoteTemplate).where(scoped(schema.quoteTemplate, ctx)).orderBy(desc(schema.quoteTemplate.isDefault), asc(schema.quoteTemplate.createdAt)),
  ]);
  return {
    clients,
    contacts: contacts.map((c) => ({ ...c, clientIds: links.filter((l) => l.contactId === c.id).map((l) => l.clientId) })),
    opportunities,
    services: services.map((s) => ({ id: s.id, name: s.name, unit: s.unit, priceArs: s.priceArs, priceUsd: s.priceUsd, descriptionMd: s.descriptionMd })),
    template: templates[0] ?? null,
  };
}

/** Valores iniciales de un presupuesto nuevo: textos e ítems de la plantilla por defecto, validez de 15 días. */
export function newQuoteDefaults(template: Awaited<ReturnType<typeof editorOptions>>["template"], opts: { clientId?: string; opportunityId?: string; title?: string; currency?: string } = {}) {
  const today = todayAR();
  return {
    clientId: opts.clientId ?? "",
    contactId: "",
    opportunityId: opts.opportunityId ?? "",
    title: opts.title ?? "",
    currency: opts.currency === "USD" ? "USD" : "ARS",
    exchangeRateRef: "",
    issueDate: today,
    validUntil: addDays(today, template?.defaultValidDays ?? 15),
    introMd: template?.introMd ?? "",
    scopeMd: template?.scopeMd ?? "",
    exclusionsMd: template?.exclusionsMd ?? "",
    termsMd: template?.termsMd ?? "",
    notesMd: "",
    items: (template?.defaultItems ?? []).map((i) => ({ serviceId: "", description: i.description, quantity: i.quantity, unit: "", unitPrice: i.unitPrice, discountType: "none", discountValue: "" })),
    globalDiscountType: "none",
    globalDiscountValue: "",
    paymentPlan: { kind: "single" } as PaymentPlan,
  };
}

// --- Documento (PDF / vista previa) ---

type DocVersion = Pick<typeof schema.quoteVersion.$inferSelect, "version" | "currency" | "exchangeRateRef" | "issueDate" | "validUntil" | "introMd" | "scopeMd" | "exclusionsMd" | "termsMd" | "notesMd" | "paymentPlan" | "globalDiscountType" | "globalDiscountValue">;
type DocItem = { description: string; quantity: string; unit: string | null; unitPrice: string; discountType: string; discountValue: string };

/** Arma el documento a partir de una versión y sus ítems (recalcula con la función pura). */
export function buildQuoteDoc(args: {
  settings: WorkspaceSettings | null | undefined;
  number: string;
  title: string;
  client: { name: string; legalName: string | null; taxId: string | null };
  contact: { name: string; email: string | null; phone: string | null } | null;
  version: DocVersion;
  items: DocItem[];
}) {
  const v = args.version;
  const totals = calcQuote({ items: args.items, globalDiscountType: v.globalDiscountType, globalDiscountValue: v.globalDiscountValue });
  const plan = v.paymentPlan;
  const schedule = paymentSchedule(plan, totals.total, v.issueDate);
  return {
    brand: brandFromSettings(args.settings),
    number: args.number,
    version: v.version,
    title: args.title,
    currency: v.currency,
    exchangeRateRef: v.exchangeRateRef,
    issueDate: v.issueDate,
    validUntil: v.validUntil,
    client: args.client,
    contact: args.contact,
    introMd: v.introMd,
    scopeMd: v.scopeMd,
    exclusionsMd: v.exclusionsMd,
    termsMd: v.termsMd,
    notesMd: v.notesMd,
    items: args.items.map((it, i) => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      discountType: it.discountType,
      discountValue: it.discountValue,
      discount: totals.lines[i]?.discount ?? discountAmount("0", "none", "0"),
      lineTotal: totals.lines[i]?.lineTotal ?? "0.00",
    })),
    totals: {
      subtotal: totals.subtotal,
      itemsDiscount: totals.itemsDiscount,
      globalDiscountType: v.globalDiscountType,
      globalDiscountValue: v.globalDiscountValue,
      globalDiscount: totals.globalDiscount,
      total: totals.total,
    },
    plan: {
      kind: plan.kind,
      monthlyAmount: plan.kind === "monthly" ? plan.amount : null,
      months: plan.kind === "monthly" ? plan.months : null,
      rows: schedule.map((r) => ({ label: r.label, percent: r.percent, amount: r.amount, offsetDays: r.offsetDays })),
    },
    calc: totals,
  };
}
export type QuoteDocData = ReturnType<typeof buildQuoteDoc>;

async function clientAndContact(ctx: Ctx, clientId: string | null | undefined, contactId: string | null | undefined) {
  const db = getDb();
  const [c] = clientId ? await db.select({ name: schema.client.name }).from(schema.client).where(and(eq(schema.client.id, clientId), scoped(schema.client, ctx, { withArchived: true }))) : [];
  const [fh] = clientId
    ? await db
        .select({ legalName: schema.clientFiscalHolder.legalName, taxId: schema.clientFiscalHolder.taxId })
        .from(schema.clientFiscalHolder)
        .where(and(eq(schema.clientFiscalHolder.clientId, clientId), scoped(schema.clientFiscalHolder, ctx)))
        .orderBy(desc(schema.clientFiscalHolder.isDefault))
        .limit(1)
    : [];
  const [ct] = contactId
    ? await db.select({ name: schema.contact.name, email: schema.contact.email, phone: schema.contact.whatsapp }).from(schema.contact).where(and(eq(schema.contact.id, contactId), scoped(schema.contact, ctx, { withArchived: true })))
    : [];
  return { client: { name: c?.name ?? "Cliente sin elegir", legalName: fh?.legalName ?? null, taxId: fh?.taxId ?? null }, contact: ct ? { name: ct.name, email: ct.email, phone: ct.phone } : null };
}

/** Documento de una versión guardada (por defecto, la actual). */
export async function getQuoteDocument(ctx: Ctx, id: string, versionId?: string | null) {
  const db = getDb();
  const [q] = await db.select().from(schema.quote).where(and(eq(schema.quote.id, id), scoped(schema.quote, ctx)));
  if (!q) return null;
  const vid = versionId || q.currentVersionId;
  if (!vid) return null;
  const [v] = await db.select().from(schema.quoteVersion).where(and(eq(schema.quoteVersion.id, vid), eq(schema.quoteVersion.quoteId, id), scoped(schema.quoteVersion, ctx)));
  if (!v) return null;
  const items = await db.select().from(schema.quoteItem).where(and(eq(schema.quoteItem.quoteVersionId, v.id), scoped(schema.quoteItem, ctx))).orderBy(asc(schema.quoteItem.sort));
  const { client, contact } = await clientAndContact(ctx, q.clientId, q.contactId);
  return buildQuoteDoc({ settings: await workspaceSettings(ctx), number: q.number, title: q.title, client, contact, version: v, items });
}

/**
 * Documento para la vista previa en vivo a partir de un borrador sin validar:
 * ignora lo incompleto y devuelve los problemas del cálculo para mostrarlos en el editor.
 */
export async function previewDocument(ctx: Ctx, raw: unknown, meta: { number?: string; version?: number } = {}) {
  const d = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max = 20000) => (typeof v === "string" ? v.slice(0, max) : "");
  const dec = (v: unknown, fallback: string) => {
    const s = str(v, 40).trim().replace(/\.(?=.*,)/g, "").replace(",", ".");
    return /^\d+(\.\d+)?$/.test(s) ? s : fallback;
  };
  const date = (v: unknown, fallback: string) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback);
  const today = todayAR();
  const rawItems = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]).slice(0, 100) : [];
  const items: DocItem[] = rawItems.map((it) => {
    const type = ["percent", "amount"].includes(str(it.discountType)) ? str(it.discountType) : "none";
    return {
      description: str(it.description, 500).trim() || "Ítem sin descripción",
      quantity: dec(it.quantity, "1"),
      unit: str(it.unit) || null,
      unitPrice: dec(it.unitPrice, "0"),
      discountType: type,
      discountValue: type === "none" ? "0" : dec(it.discountValue, "0"),
    };
  });
  const p = (d.paymentPlan ?? {}) as Record<string, unknown>;
  let plan: PaymentPlan = { kind: "single" };
  if (p.kind === "milestones" && Array.isArray(p.items)) {
    plan = { kind: "milestones", items: (p.items as Record<string, unknown>[]).slice(0, 12).map((m) => ({ label: str(m.label, 80) || "Etapa", percent: Number(dec(m.percent, "0")), offsetDays: Math.max(0, Math.floor(Number(dec(m.offsetDays, "0")))) })) };
  } else if (p.kind === "monthly") {
    const months = dec(p.months, "");
    plan = { kind: "monthly", amount: dec(p.amount, "0"), months: months ? Math.max(1, Math.floor(Number(months))) : null };
  }
  const gType = ["percent", "amount"].includes(str(d.globalDiscountType)) ? str(d.globalDiscountType) : "none";
  const issueDate = date(d.issueDate, today);
  const { client, contact } = await clientAndContact(ctx, /^[0-9a-f-]{36}$/i.test(str(d.clientId)) ? str(d.clientId) : null, /^[0-9a-f-]{36}$/i.test(str(d.contactId)) ? str(d.contactId) : null);
  return buildQuoteDoc({
    settings: await workspaceSettings(ctx),
    number: meta.number ?? `P-${today.slice(0, 4)}-····`,
    title: str(d.title, 200).trim() || "Presupuesto sin título",
    client,
    contact,
    version: {
      version: meta.version ?? 1,
      currency: d.currency === "USD" ? "USD" : "ARS",
      exchangeRateRef: dec(d.exchangeRateRef, "") || null,
      issueDate,
      validUntil: date(d.validUntil, addDays(issueDate, 15)),
      introMd: str(d.introMd) || null,
      scopeMd: str(d.scopeMd) || null,
      exclusionsMd: str(d.exclusionsMd) || null,
      termsMd: str(d.termsMd) || null,
      notesMd: str(d.notesMd) || null,
      paymentPlan: plan,
      globalDiscountType: gType,
      globalDiscountValue: gType === "none" ? "0" : dec(d.globalDiscountValue, "0"),
    },
    items,
  });
}

/** Texto para pegar en WhatsApp o en un email al enviar el presupuesto. */
export function shareText(doc: QuoteDocData, contactName?: string | null) {
  const first = contactName?.split(" ")[0];
  const m = (v: string) => formatMoney(v, doc.currency);
  const plan =
    doc.plan.kind === "monthly"
      ? `Abono mensual de ${m(doc.plan.monthlyAmount ?? "0")}${doc.plan.months ? ` durante ${doc.plan.months} meses` : ""}.`
      : doc.plan.kind === "milestones"
        ? `Forma de pago: ${doc.plan.rows.map((r) => `${r.percent ?? ""} % (${m(r.amount)}) ${r.label.toLowerCase()}`).join(" + ")}.`
        : "Pago único.";
  return [
    `Hola${first ? ` ${first}` : ""}! Te comparto el presupuesto ${doc.number}${doc.version > 1 ? ` (versión ${doc.version})` : ""}: «${doc.title}».`,
    "",
    ...doc.items.map((i) => `• ${i.description}: ${m(i.lineTotal)}`),
    "",
    `Total: ${m(doc.totals.total)} (precios finales).`,
    plan,
    `Válido hasta el ${formatDate(doc.validUntil)}.`,
    "",
    "Te adjunto el PDF con el detalle. Cualquier duda, escribime.",
    doc.brand.name,
  ].join("\n");
}

/** Lo que va a pasar al aceptar: plantilla que se usaría y cuotas del plan (con fecha de hoy). */
export async function acceptancePreview(ctx: Ctx, d: QuoteDetail) {
  const db = getDb();
  const v = d.current;
  if (!v) return null;
  const items = d.versions.find((x) => x.id === v.id)?.items ?? [];
  const serviceIds = items.map((i) => i.serviceId).filter(Boolean) as string[];
  let templateName: string | null = null;
  if (serviceIds.length) {
    const rows = await db
      .select({ id: schema.service.id, name: schema.projectTemplate.name })
      .from(schema.service)
      .innerJoin(schema.projectTemplate, and(eq(schema.projectTemplate.id, schema.service.projectTemplateId), scoped(schema.projectTemplate, ctx)))
      .where(and(inArray(schema.service.id, serviceIds), eq(schema.service.workspaceId, ctx.workspaceId)));
    for (const id of serviceIds) {
      const hit = rows.find((r) => r.id === id);
      if (hit) {
        templateName = hit.name;
        break;
      }
    }
  }
  if (!templateName) {
    const [blank] = await db.select({ name: schema.projectTemplate.name }).from(schema.projectTemplate).where(and(eq(schema.projectTemplate.key, "en-blanco"), scoped(schema.projectTemplate, ctx)));
    templateName = blank?.name ?? null;
  }
  return { templateName, schedule: paymentSchedule(v.paymentPlan, v.total, todayAR()), currency: v.currency };
}

export const quoteStatusLabel = (s: string) => label(L.quoteStatus, s);
