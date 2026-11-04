import { type Ctx, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { getClient, getContact, listClients, listOpportunities } from "@agencyos/modules/crm/queries";
import {
  addFiscalHolder, archiveClient, createClient, createContact, createOpportunity, deleteClient, linkContact, logInteraction,
  mergeClients, moveOpportunity, revealFiscalHolders, unarchiveClient, updateClient,
} from "@agencyos/modules/crm/service";
import { createProject } from "@agencyos/modules/projects/service";
import { getToday } from "@agencyos/modules/today/queries";
import { moveToTrash } from "@agencyos/modules/trash/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

const member = (c: Ctx): Ctx => ({ ...c, role: "member" });

async function insertQuote(ctx: Ctx, clientId: string, number: string) {
  const [q] = await getDb().insert(schema.quote).values({ workspaceId: ctx.workspaceId, number, clientId, title: `Presupuesto ${number}` }).returning();
  if (!q) throw new Error("quote");
  return q;
}

describe("CRM", () => {
  it("crea cliente con contacto principal en el espacio Agencia y registra el evento", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Bellezatecnia", industry: "Estética", website: "bellezatecnia.com.ar", contactName: "Sofía", contactEmail: "sofia@example.com", contactPhone: "+54 9 341 555-1234" });
    const agency = ctx.spaces.find((s) => s.kind === "agency");
    expect(c.spaceId).toBe(agency?.id);
    expect(c.status).toBe("prospect");
    expect(c.website).toBe("https://bellezatecnia.com.ar");
    const data = await getClient(ctx, c.id);
    expect(data?.contacts).toHaveLength(1);
    expect(data?.contacts[0]?.isPrimary).toBe(true);
    expect(data?.contacts[0]?.ct.whatsapp).toBe("+54 9 341 555-1234");
    const ev = await getDb().select().from(schema.domainEvent).where(and(eq(schema.domainEvent.workspaceId, ctx.workspaceId), eq(schema.domainEvent.type, "cliente.creado")));
    expect(ev).toHaveLength(1);
  });

  it("valida nombre, email, teléfono y CUIT", async () => {
    const ctx = await makeWorkspace();
    await expect(createClient(ctx, { name: "  " })).rejects.toThrow();
    await expect(createClient(ctx, { name: "X", contactName: "Y", contactEmail: "no-es-mail" })).rejects.toThrow();
    await expect(createContact(ctx, { name: "Z", phone: "abc" })).rejects.toThrow();
    const c = await createClient(ctx, { name: "Fiscal SA" });
    await expect(addFiscalHolder(ctx, c.id, { legalName: "Fiscal SA", taxId: "20-12345678-0" })).rejects.toThrow(/CUIT/);
    const ok = await addFiscalHolder(ctx, c.id, { legalName: "Fiscal SA", taxId: "20-12345678-6", vatCondition: "monotributo" });
    expect(ok.id).toBeDefined();
  });

  it("titulares fiscales: revelar audita fiscal.viewed; member no puede verlos", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Con CUIT" });
    await addFiscalHolder(ctx, c.id, { legalName: "Con CUIT SRL", taxId: "20123456786" });
    const data = await getClient(ctx, c.id);
    expect(data?.fiscalCount).toBe(1);
    expect(JSON.stringify(data)).not.toContain("Con CUIT SRL");
    const holders = await revealFiscalHolders(ctx, c.id);
    expect(holders[0]?.legalName).toBe("Con CUIT SRL");
    const logs = await getDb().select().from(schema.auditLog).where(and(eq(schema.auditLog.workspaceId, ctx.workspaceId), eq(schema.auditLog.action, "fiscal.viewed")));
    expect(logs).toHaveLength(1);
    await expect(revealFiscalHolders(member(ctx), c.id)).rejects.toThrow(/permiso/);
    expect((await getClient(member(ctx), c.id))?.canSeeFiscal).toBe(false);
  });

  it("interacción: actualiza la última actividad y su próximo paso vencido aparece en Hoy", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Librería Uno" });
    const ct = await createContact(ctx, { name: "Ana", clientId: c.id, whatsapp: "+5493415551234" });
    const before = (await getClient(ctx, c.id))?.c.lastActivityAt;
    await new Promise((r) => setTimeout(r, 10));
    await logInteraction(ctx, { clientId: c.id, contactId: ct.id, kind: "call", date: "2026-11-01", time: "10:30", summaryMd: "Charlamos del **catálogo**", nextStep: "Mandar propuesta", nextStepDue: todayAR() });
    const data = await getClient(ctx, c.id);
    expect(data?.interactions).toHaveLength(1);
    expect(data?.interactions[0]?.i.occurredAt.toISOString()).toBe("2026-11-01T13:30:00.000Z");
    expect(data?.c.lastActivityAt?.getTime()).toBeGreaterThan(before?.getTime() ?? 0);
    expect(data?.contacts[0]?.isPrimary).toBe(true);
    await expect(logInteraction(ctx, { clientId: c.id, kind: "call", summaryMd: "" })).rejects.toThrow();
    await createOpportunity(ctx, { clientId: c.id, title: "Catálogo", nextAction: "Llamar a Ana", nextActionDue: todayAR() });
    const today = await getToday(ctx, { userId: ctx.userId ?? "" });
    const titles = today.catchUp.map((x) => x.title).join(" | ");
    expect(titles).toContain("Mandar propuesta");
    expect(titles).toContain("Llamar a Ana");
  });

  it("pipeline: nuevo → … → ganada; propuesta exige presupuesto; prospecto pasa a activo", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Tienda Sur", contactName: "Juan" });
    const o = await createOpportunity(ctx, { clientId: c.id, title: "Tienda online", valueAmount: "1.500.000,50", valueCurrency: "ARS", probability: "40", nextAction: "Llamar", nextActionDue: "2026-11-05" });
    expect(o.valueAmount).toBe("1500000.50");
    for (const stage of ["contacted", "meeting"]) await moveOpportunity(ctx, o.id, { stage });
    await expect(moveOpportunity(ctx, o.id, { stage: "proposal_sent" })).rejects.toThrow(/presupuesto/);
    const other = await createClient(ctx, { name: "Otro" });
    const foreign = await insertQuote(ctx, other.id, "P-0001");
    await expect(moveOpportunity(ctx, o.id, { stage: "proposal_sent", quoteId: foreign.id })).rejects.toThrow(/cliente/);
    const q = await insertQuote(ctx, c.id, "P-0002");
    await moveOpportunity(ctx, o.id, { stage: "proposal_sent", quoteId: q.id });
    const [linked] = await getDb().select().from(schema.quote).where(eq(schema.quote.id, q.id));
    expect(linked?.opportunityId).toBe(o.id);
    await moveOpportunity(ctx, o.id, { stage: "negotiation" });
    const won = await moveOpportunity(ctx, o.id, { stage: "won" });
    expect(won.wonAt).toBeInstanceOf(Date);
    expect(won.probability).toBe(100);
    expect(won.clientActivated).toBe(true);
    expect((await getClient(ctx, c.id))?.c.status).toBe("active");
    const types = (await getDb().select().from(schema.domainEvent).where(eq(schema.domainEvent.workspaceId, ctx.workspaceId))).map((e) => e.type);
    expect(types.filter((t) => t === "oportunidad.etapa_cambiada")).toHaveLength(4);
    expect(types).toContain("oportunidad.ganada");
    expect(types).toContain("cliente.estado_cambiado");
  });

  it("perdida sin motivo falla; con motivo registra lostAt y lostReason", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Perdido" });
    const o = await createOpportunity(ctx, { clientId: c.id, title: "Landing" });
    await expect(moveOpportunity(ctx, o.id, { stage: "lost" })).rejects.toThrow(/motivo/);
    const lost = await moveOpportunity(ctx, o.id, { stage: "lost", lostReason: "price" });
    expect(lost.lostReason).toBe("price");
    expect(lost.lostAt).toBeInstanceOf(Date);
    expect(lost.probability).toBe(0);
    const reopened = await moveOpportunity(ctx, o.id, { stage: "contacted" });
    expect(reopened.lostAt).toBeNull();
    expect(reopened.lostReason).toBeNull();
  });

  it("fusionar duplicados mueve todo al destino y manda el duplicado a la papelera", async () => {
    const ctx = await makeWorkspace();
    const target = await createClient(ctx, { name: "Bellezatecnia", contactName: "Sofía" });
    const dup = await createClient(ctx, { name: "Belleza Tecnia", notesMd: "Nota del duplicado", city: "Rosario", contactName: "Marta" });
    const shared = await createContact(ctx, { name: "Compartido", clientId: target.id });
    await linkContact(ctx, dup.id, { contactId: shared.id });
    await logInteraction(ctx, { clientId: dup.id, kind: "whatsapp", summaryMd: "Hola" });
    const o = await createOpportunity(ctx, { clientId: dup.id, title: "SEO" });
    const p = await createProject(ctx, { name: "Sitio", clientId: dup.id });
    const q = await insertQuote(ctx, dup.id, "P-0100");
    const [r] = await getDb().insert(schema.receivable).values({ workspaceId: ctx.workspaceId, clientId: dup.id, concept: "Anticipo", amount: "1000.00", currency: "ARS" }).returning();
    await addFiscalHolder(ctx, dup.id, { legalName: "Belleza SRL" });

    const res = await mergeClients(ctx, dup.id, target.id);
    expect(res.counts).toMatchObject({ interactions: 1, opportunities: 1, projects: 1, quotes: 1, receivables: 1, contacts: 1, fiscalHolders: 1 });
    const data = await getClient(ctx, target.id);
    expect(data?.contacts.map((x) => x.ct.name).sort()).toEqual(["Compartido", "Marta", "Sofía"]);
    expect(data?.contacts.filter((x) => x.isPrimary)).toHaveLength(1);
    expect(data?.contacts.find((x) => x.isPrimary)?.ct.name).toBe("Sofía");
    expect(data?.opportunities[0]?.id).toBe(o.id);
    expect(data?.projects[0]?.id).toBe(p.id);
    expect(data?.quotes[0]?.id).toBe(q.id);
    expect(data?.c.city).toBe("Rosario");
    expect(data?.c.notesMd).toContain("Nota del duplicado");
    const [rr] = await getDb().select().from(schema.receivable).where(eq(schema.receivable.id, r?.id ?? ""));
    expect(rr?.clientId).toBe(target.id);
    expect(await getClient(ctx, dup.id)).toBeNull();
    const logs = await getDb().select().from(schema.auditLog).where(and(eq(schema.auditLog.workspaceId, ctx.workspaceId), eq(schema.auditLog.action, "client.merged")));
    expect(logs).toHaveLength(1);
    await expect(mergeClients(ctx, target.id, target.id)).rejects.toThrow();
  });

  it("eliminar un cliente con proyectos obliga a archivar todo; deshacer lo restaura", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Con proyecto", status: "active" });
    const p = await createProject(ctx, { name: "Proyecto X", clientId: c.id });
    await expect(deleteClient(ctx, c.id)).rejects.toThrow(/proyecto/);
    const r = await archiveClient(ctx, c.id, { withProjects: true });
    expect(r.projectIds).toEqual([p.id]);
    expect((await getClient(ctx, c.id))?.c.status).toBe("archived");
    expect((await listClients(ctx)).find((x) => x.c.id === c.id)).toBeUndefined();
    expect((await listClients(ctx, { status: "archived" })).find((x) => x.c.id === c.id)).toBeDefined();
    const [pa] = await getDb().select().from(schema.project).where(eq(schema.project.id, p.id));
    expect(pa?.archivedAt).toBeInstanceOf(Date);
    await unarchiveClient(ctx, c.id, r.previousStatus, r.projectIds);
    expect((await getClient(ctx, c.id))?.c.status).toBe("active");
    const [pb] = await getDb().select().from(schema.project).where(eq(schema.project.id, p.id));
    expect(pb?.archivedAt).toBeNull();

    const sinProyectos = await createClient(ctx, { name: "Sin proyectos" });
    await deleteClient(ctx, sinProyectos.id);
    expect(await getClient(ctx, sinProyectos.id)).toBeNull();
  });

  it("cambiar el estado registra cliente.estado_cambiado", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Estado" });
    await updateClient(ctx, c.id, { name: "Estado", status: "paused", relationship: "family" });
    const ev = await getDb().select().from(schema.activity).where(and(eq(schema.activity.workspaceId, ctx.workspaceId), eq(schema.activity.verb, "cliente.estado_cambiado")));
    expect(ev[0]?.summary).toContain("en pausa");
  });

  it("aislamiento multi-inquilino: A no ve ni modifica datos de B", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const cb = await createClient(b, { name: "Secreto de B" });
    const ob = await createOpportunity(b, { clientId: cb.id, title: "Opp de B" });
    const ctb = await createContact(b, { name: "Contacto de B", clientId: cb.id });
    const ca = await createClient(a, { name: "Cliente de A" });
    expect((await listClients(a)).find((x) => x.c.id === cb.id)).toBeUndefined();
    expect(await getClient(a, cb.id)).toBeNull();
    expect(await getContact(a, ctb.id)).toBeNull();
    expect((await listOpportunities(a)).find((x) => x.o.id === ob.id)).toBeUndefined();
    await expect(moveOpportunity(a, ob.id, { stage: "won" })).rejects.toThrow();
    await expect(createOpportunity(a, { clientId: cb.id, title: "Intruso" })).rejects.toThrow();
    await expect(logInteraction(a, { clientId: cb.id, kind: "call", summaryMd: "x" })).rejects.toThrow();
    await expect(linkContact(a, ca.id, { contactId: ctb.id })).rejects.toThrow();
    await expect(mergeClients(a, cb.id, ca.id)).rejects.toThrow();
    await expect(revealFiscalHolders(a, cb.id)).rejects.toThrow();
    await expect(moveToTrash(a, "client", cb.id)).rejects.toThrow();
  });

  it("permisos MCP: write:crm crea; sin alcance no puede fusionar ni eliminar", async () => {
    const ctx = await makeWorkspace();
    const bot = agentCtx(ctx, ["read:all", "write:crm"]);
    const c = await createClient(bot, { name: "Desde Claude" });
    expect(c.name).toBe("Desde Claude");
    const other = await createClient(ctx, { name: "Otro" });
    await expect(mergeClients(bot, c.id, other.id)).rejects.toThrow(/alcance/);
    await expect(deleteClient(bot, c.id)).rejects.toThrow(/alcance/);
    await expect(revealFiscalHolders(bot, c.id)).rejects.toThrow(/alcance/);
  });
});
