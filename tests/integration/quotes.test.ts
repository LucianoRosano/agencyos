import { addDays, type Ctx, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { closeBrowser, renderQuoteHtml, renderQuotePdf } from "../../packages/pdf/src/index"; // @agencyos/pdf no es dependencia de la raíz
import { listTemplates } from "@agencyos/modules/projects/queries";
import { getQuote, getQuoteDocument, listQuotes, previewDocument } from "@agencyos/modules/quotes/queries";
import {
  acceptQuote, createNewVersion, createQuote, createService, expireQuotes, markSent, markViewed, rejectQuote, updateQuote, voidQuote,
} from "@agencyos/modules/quotes/service";
import { writeFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

async function makeClient(ctx: Ctx, name = "Bellezatecnia") {
  const [c] = await getDb().insert(schema.client).values({ workspaceId: ctx.workspaceId, name, status: "prospect" }).returning();
  if (!c) throw new Error("client");
  return c;
}

async function makeOpportunity(ctx: Ctx, clientId: string) {
  const [o] = await getDb().insert(schema.opportunity).values({ workspaceId: ctx.workspaceId, clientId, title: "Tienda online", stage: "meeting" }).returning();
  if (!o) throw new Error("opp");
  return o;
}

const today = todayAR();
const baseQuote = (clientId: string, extra: Record<string, unknown> = {}) => ({
  clientId,
  title: "Tienda online con WooCommerce",
  currency: "ARS",
  issueDate: today,
  validUntil: addDays(today, 15),
  items: [
    { description: "Diseño y desarrollo de la tienda", quantity: "1", unitPrice: "300000", discountType: "percent", discountValue: "10" },
    { description: "Carga de productos", quantity: "2", unitPrice: "50000", discountType: "amount", discountValue: "10000" },
    { description: "Capacitación", quantity: "1", unitPrice: "45000" },
  ],
  globalDiscountType: "percent",
  globalDiscountValue: "5",
  paymentPlan: { kind: "milestones", items: [{ label: "Anticipo", percent: 50, offsetDays: 0 }, { label: "Saldo a la entrega", percent: 50, offsetDays: 30 }] },
  ...extra,
});

afterAll(async () => {
  await closeBrowser();
});

describe("presupuestos", () => {
  it("numeración P-AAAA-NNNN correlativa por workspace, sin duplicados en paralelo", async () => {
    const ctx = await makeWorkspace();
    const other = await makeWorkspace("Otro");
    const c = await makeClient(ctx);
    const co = await makeClient(other);
    const created = await Promise.all(Array.from({ length: 8 }, () => createQuote(ctx, baseQuote(c.id))));
    const year = today.slice(0, 4);
    expect(created.map((q) => q.number).sort()).toEqual(Array.from({ length: 8 }, (_, i) => `P-${year}-${String(i + 1).padStart(4, "0")}`));
    // otro workspace arranca su propia numeración
    expect((await createQuote(other, baseQuote(co.id))).number).toBe(`P-${year}-0001`);
  });

  it("calcula los totales en el servidor (descuento por ítem y global)", async () => {
    const ctx = await makeWorkspace();
    const c = await makeClient(ctx);
    const q = await createQuote(ctx, baseQuote(c.id));
    const d = await getQuote(ctx, q.id);
    expect(d?.current?.subtotal).toBe("445000.00");
    expect(d?.current?.discountTotal).toBe("60250.00");
    expect(d?.current?.total).toBe("384750.00");
    expect(d?.versions[0]?.items.map((i) => i.lineTotal)).toEqual(["270000.00", "90000.00", "45000.00"]);
    const ev = await getDb().select().from(schema.domainEvent).where(and(eq(schema.domainEvent.entityId, q.id), eq(schema.domainEvent.type, "presupuesto.creado")));
    expect(ev).toHaveLength(1);
  });

  it("valida: al menos 1 ítem, precios ≥ 0, descuento ≤ subtotal, plan que sume 100", async () => {
    const ctx = await makeWorkspace();
    const c = await makeClient(ctx);
    await expect(createQuote(ctx, baseQuote(c.id, { items: [] }))).rejects.toThrow(/al menos un ítem/);
    await expect(createQuote(ctx, baseQuote(c.id, { items: [{ description: "X", quantity: "1", unitPrice: "-5" }] }))).rejects.toThrow();
    await expect(createQuote(ctx, baseQuote(c.id, { globalDiscountType: "amount", globalDiscountValue: "999999" }))).rejects.toThrow(/supera el subtotal/);
    await expect(
      createQuote(ctx, baseQuote(c.id, { paymentPlan: { kind: "milestones", items: [{ label: "A", percent: 50 }, { label: "B", percent: 40 }] } })),
    ).rejects.toThrow(/sumar 100/);
    await expect(createQuote(ctx, baseQuote(c.id, { clientId: "" }))).rejects.toThrow();
  });

  it("un enviado no se edita: se versiona copiando ítems y se puede comparar", async () => {
    const ctx = await makeWorkspace();
    const c = await makeClient(ctx);
    const q = await createQuote(ctx, baseQuote(c.id));
    await updateQuote(ctx, q.id, baseQuote(c.id, { title: "Editado en borrador" }));
    await markSent(ctx, q.id);
    await expect(updateQuote(ctx, q.id, baseQuote(c.id, { title: "No debería" }))).rejects.toThrow(/nueva versión/);
    const { version } = await createNewVersion(ctx, q.id);
    expect(version.version).toBe(2);
    const d = await getQuote(ctx, q.id);
    expect(d?.q.status).toBe("draft");
    expect(d?.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(d?.versions[1]?.lockedAt).not.toBeNull();
    expect(d?.versions[0]?.lockedAt).toBeNull();
    expect(d?.versions[0]?.items).toHaveLength(3);
    // la v2 sí se edita; la v1 queda intacta
    await updateQuote(ctx, q.id, baseQuote(c.id, { title: "Editado en borrador", globalDiscountType: "none" }));
    const d2 = await getQuote(ctx, q.id);
    expect(d2?.versions[0]?.total).toBe("405000.00");
    expect(d2?.versions[1]?.total).toBe("384750.00");
  });

  it("no se envía con la validez vencida", async () => {
    const ctx = await makeWorkspace();
    const c = await makeClient(ctx);
    const q = await createQuote(ctx, baseQuote(c.id, { issueDate: addDays(today, -20), validUntil: addDays(today, -1) }));
    await expect(markSent(ctx, q.id)).rejects.toThrow(/validez/);
  });

  it("marcar enviado mueve la oportunidad a «propuesta enviada»; aceptar crea proyecto + 2 cobros 50/50 y gana la oportunidad", async () => {
    const ctx = await makeWorkspace();
    const c = await makeClient(ctx);
    const opp = await makeOpportunity(ctx, c.id);
    const q = await createQuote(ctx, baseQuote(c.id, { opportunityId: opp.id }));
    await expect(acceptQuote(ctx, q.id, { createProject: "on" })).rejects.toThrow(/enviado/);
    await markSent(ctx, q.id);
    const [o1] = await getDb().select().from(schema.opportunity).where(eq(schema.opportunity.id, opp.id));
    expect(o1?.stage).toBe("proposal_sent");
    await markViewed(ctx, q.id);
    const r = await acceptQuote(ctx, q.id, { createProject: "on", createReceivables: "on", markOpportunityWon: "on" });
    expect(r.quote?.status).toBe("accepted");
    expect(r.receivables.map((x) => x.amount)).toEqual(["192375.00", "192375.00"]);
    expect(r.receivables.map((x) => x.dueDate)).toEqual([today, addDays(today, 30)]);
    expect(r.receivables.every((x) => x.projectId === r.projectId && x.status === "pending" && x.currency === "ARS")).toBe(true);
    const [p] = await getDb().select().from(schema.project).where(eq(schema.project.id, r.projectId ?? ""));
    expect(p?.quoteId).toBe(q.id);
    expect(p?.definitionOfDone).toBe(q.title);
    const tasks = await getDb().select().from(schema.task).where(eq(schema.task.projectId, p?.id ?? ""));
    expect(tasks.some((t) => t.title === "Kickoff con el cliente" && t.dueDate === today)).toBe(true);
    const [o2] = await getDb().select().from(schema.opportunity).where(eq(schema.opportunity.id, opp.id));
    expect(o2?.stage).toBe("won");
    expect(o2?.wonAt).not.toBeNull();
    // no se acepta dos veces
    await expect(acceptQuote(ctx, q.id, {})).rejects.toThrow(/aceptado/);
  });

  it("usa la plantilla de proyecto del servicio principal y genera 12 cobros para un abono indefinido", async () => {
    const ctx = await makeWorkspace();
    const c = await makeClient(ctx);
    const tpl = (await listTemplates(ctx)).find((t) => t.key === "tienda-online");
    const svc = await createService(ctx, { name: "Tienda online", unit: "project", priceArs: "300000", projectTemplateId: tpl?.id, active: "on" });
    const q = await createQuote(
      ctx,
      baseQuote(c.id, {
        items: [{ serviceId: svc.id, description: "Tienda online", quantity: "1", unitPrice: "300000" }],
        globalDiscountType: "none",
        paymentPlan: { kind: "monthly", amount: "45000", months: "" },
      }),
    );
    await markSent(ctx, q.id);
    const r = await acceptQuote(ctx, q.id, { createProject: "on", createReceivables: "on" });
    const [p] = await getDb().select().from(schema.project).where(eq(schema.project.id, r.projectId ?? ""));
    expect(p?.templateId).toBe(tpl?.id);
    expect(r.receivables).toHaveLength(12);
    expect(r.receivables[11]?.amount).toBe("45000.00");
  });

  it("rechazar con motivo y anular", async () => {
    const ctx = await makeWorkspace();
    const c = await makeClient(ctx);
    const a = await createQuote(ctx, baseQuote(c.id));
    await markSent(ctx, a.id);
    expect((await rejectQuote(ctx, a.id, "Precio"))?.status).toBe("rejected");
    const b = await createQuote(ctx, baseQuote(c.id));
    expect((await voidQuote(ctx, b.id))?.status).toBe("void");
    await expect(markSent(ctx, b.id)).rejects.toThrow();
  });

  it("expireQuotes vence los enviados/vistos con validez pasada", async () => {
    const ctx = await makeWorkspace();
    const c = await makeClient(ctx);
    const sent = await createQuote(ctx, baseQuote(c.id, { validUntil: today }));
    const viewed = await createQuote(ctx, baseQuote(c.id, { validUntil: today }));
    const draft = await createQuote(ctx, baseQuote(c.id, { validUntil: today }));
    const ok = await createQuote(ctx, baseQuote(c.id, { validUntil: addDays(today, 10) }));
    await markSent(ctx, sent.id);
    await markSent(ctx, viewed.id);
    await markViewed(ctx, viewed.id);
    await markSent(ctx, ok.id);
    expect(await expireQuotes(today, ctx.workspaceId)).toHaveLength(0);
    const due = await expireQuotes(addDays(today, 1), ctx.workspaceId);
    expect(due.map((d) => d.id).sort()).toEqual([sent.id, viewed.id].sort());
    const rows = await listQuotes(ctx);
    const status = Object.fromEntries(rows.map((r) => [r.q.id, r.q.status]));
    expect(status[sent.id]).toBe("expired");
    expect(status[viewed.id]).toBe("expired");
    expect(status[draft.id]).toBe("draft");
    expect(status[ok.id]).toBe("sent");
  });

  it("aislamiento multi-inquilino: A no ve ni modifica presupuestos de B", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const cb = await makeClient(b);
    const ca = await makeClient(a);
    const qb = await createQuote(b, baseQuote(cb.id));
    expect((await listQuotes(a)).find((r) => r.q.id === qb.id)).toBeUndefined();
    expect(await getQuote(a, qb.id)).toBeNull();
    expect(await getQuoteDocument(a, qb.id)).toBeNull();
    await expect(markSent(a, qb.id)).rejects.toThrow();
    await expect(updateQuote(a, qb.id, baseQuote(ca.id))).rejects.toThrow();
    await expect(createNewVersion(a, qb.id)).rejects.toThrow();
    // A no puede usar un cliente de B
    await expect(createQuote(a, baseQuote(cb.id))).rejects.toThrow(/cliente/);
  });

  it("permisos: un token MCP de lectura no crea presupuestos", async () => {
    const ctx = await makeWorkspace();
    const c = await makeClient(ctx);
    await expect(createQuote(agentCtx(ctx, ["read:all"]), baseQuote(c.id))).rejects.toThrow(/alcance/);
  });

  it("genera el HTML y el PDF (A4) con la marca Luciano Rosano y el total", async () => {
    const ctx = await makeWorkspace();
    const c = await makeClient(ctx);
    const q = await createQuote(ctx, baseQuote(c.id));
    const doc = await getQuoteDocument(ctx, q.id);
    if (!doc) throw new Error("doc");
    expect(doc.brand.name).toBe("Luciano Rosano");
    expect(doc.brand.phone).toBe("11 5526-0021");
    const html = renderQuoteHtml(doc);
    expect(html).toContain("$ 384.750");
    expect(html).toContain("Precios finales");
    expect(html).toContain(q.number);
    const pdf = await renderQuotePdf(doc);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(10_000);
    if (process.env.QUOTE_PDF_OUT) {
      writeFileSync(process.env.QUOTE_PDF_OUT, pdf);
      writeFileSync(`${process.env.QUOTE_PDF_OUT}.html`, html);
    }
    // vista previa a partir de un borrador sin validar
    const prev = await previewDocument(ctx, { ...baseQuote(c.id), globalDiscountType: "none", items: [{ description: "", quantity: "abc", unitPrice: "1.000,50" }] });
    expect(prev.totals.total).toBe("1000.50");
  }, 60_000);
});
