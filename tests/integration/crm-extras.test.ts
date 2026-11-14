import type { Ctx } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { opportunityServices, setOpportunityServices } from "@agencyos/modules/crm/opportunity-services";
import { createClient, createOpportunity, moveOpportunity } from "@agencyos/modules/crm/service";
import { addStage, deleteStage, listPipelineStages, moveStage, pipelineFor, restoreStage, updateStage } from "@agencyos/modules/crm/stages";
import { importWhatsapp, previewWhatsapp } from "@agencyos/modules/crm/whatsapp-import";
import { createService } from "@agencyos/modules/quotes/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

const member = (c: Ctx): Ctx => ({ ...c, role: "member" });

async function service(ctx: Ctx, name: string) {
  return createService(ctx, { name, unit: "project", priceArs: "100000", priceUsd: "", descriptionMd: "" });
}

describe("CRM · etapas editables", () => {
  it("sin configurar usa las fijas; editar siembra, renombra, ordena y agrega intermedias", async () => {
    const ctx = await makeWorkspace();
    const initial = await listPipelineStages(ctx);
    expect(initial.map((s) => s.key)).toEqual(["new", "contacted", "meeting", "proposal_sent", "negotiation", "won", "lost"]);
    expect(initial.every((s) => s.id === null)).toBe(true);

    await updateStage(ctx, "meeting", { name: "Llamada", probability: "35" });
    const custom = await addStage(ctx, { name: "Demo", probability: "50", afterKey: "meeting" });
    let st = await listPipelineStages(ctx);
    expect(st.map((s) => s.name)).toEqual(["Nuevo", "Contactado", "Llamada", "Demo", "Propuesta enviada", "Negociación", "Ganada", "Perdida"]);
    expect(st.find((s) => s.key === custom?.key)?.base).toBe("meeting");

    await moveStage(ctx, custom?.key as string, "up");
    st = await listPipelineStages(ctx);
    expect(st.map((s) => s.key).indexOf(custom?.key as string)).toBe(2);
    expect(st.find((s) => s.key === custom?.key)?.base).toBe("contacted");
    await expect(moveStage(ctx, "won", "up")).rejects.toThrow(/abiertas/);
    await expect(deleteStage(ctx, "won")).rejects.toThrow(/no se eliminan/);
    await expect(deleteStage(ctx, "new")).rejects.toThrow(/no se eliminan/);
    await expect(addStage(ctx, { name: "demo", probability: "10" })).rejects.toThrow(/Ya hay/);
    // ganada siempre 100 %
    await updateStage(ctx, "won", { name: "¡Cerrada!", probability: "20" });
    expect((await listPipelineStages(ctx)).find((s) => s.key === "won")).toMatchObject({ name: "¡Cerrada!", probability: 100 });
  });

  it("mover a una etapa propia guarda la base, aplica la probabilidad y se ve en el kanban", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Pipeline SA" });
    const o = await createOpportunity(ctx, { clientId: c.id, title: "Web nueva" });
    const demo = await addStage(ctx, { name: "Demo", probability: "45", afterKey: "contacted" });
    const r = await moveOpportunity(ctx, o.id, { stage: demo?.key });
    expect(r.stage).toBe(demo?.key);
    expect(r.probability).toBe(45);
    const [row] = await getDb().select().from(schema.opportunity).where(eq(schema.opportunity.id, o.id));
    expect(row?.stage).toBe("contacted");
    let view = await pipelineFor(ctx, [row as { id: string; stage: string }]);
    expect(view.stageOf.get(o.id)).toBe(demo?.key);
    // volver a una de sistema quita la ubicación propia
    const back = await moveOpportunity(ctx, o.id, { stage: "contacted" });
    expect(back.previousStage).toBe(demo?.key);
    expect(back.probability).toBe(20);
    view = await pipelineFor(ctx, [{ id: o.id, stage: "contacted" }]);
    expect(view.stageOf.get(o.id)).toBe("contacted");
    // eliminar la etapa: la oportunidad vuelve a verse en su base; restaurar la recupera
    await moveOpportunity(ctx, o.id, { stage: demo?.key });
    await deleteStage(ctx, demo?.key as string);
    expect((await pipelineFor(ctx, [{ id: o.id, stage: "contacted" }])).stageOf.get(o.id)).toBe("contacted");
    await restoreStage(ctx, demo?.key as string);
    expect((await pipelineFor(ctx, [{ id: o.id, stage: "contacted" }])).stageOf.get(o.id)).toBe(demo?.key);
    await expect(moveOpportunity(ctx, o.id, { stage: "inexistente" })).rejects.toThrow(/Etapa inválida/);
  });

  it("solo administración edita etapas y cada workspace tiene las suyas", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    await expect(updateStage(member(a), "new", { name: "X", probability: "10" })).rejects.toThrow();
    const st = await addStage(a, { name: "Solo de A", probability: "30" });
    expect((await listPipelineStages(b)).some((s) => s.key === st?.key)).toBe(false);
    const cb = await createClient(b, { name: "De B" });
    const ob = await createOpportunity(b, { clientId: cb.id, title: "Op B" });
    await expect(moveOpportunity(b, ob.id, { stage: st?.key })).rejects.toThrow(/Etapa inválida/);
    await expect(deleteStage(b, st?.key as string)).rejects.toThrow();
  });
});

describe("CRM · servicios de interés", () => {
  it("elige servicios del catálogo, reemplaza la selección y valida pertenencia", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const c = await createClient(a, { name: "Cliente" });
    const o = await createOpportunity(a, { clientId: c.id, title: "Op" });
    const s1 = await service(a, "Sitio web");
    const s2 = await service(a, "SEO");
    const sb = await service(b, "De B");
    await setOpportunityServices(a, o.id, { serviceIds: [s1.id, s2.id] });
    expect((await opportunityServices(a, o.id)).map((s) => s.name)).toEqual(["SEO", "Sitio web"]);
    await setOpportunityServices(a, o.id, { serviceIds: s1.id });
    expect((await opportunityServices(a, o.id)).map((s) => s.name)).toEqual(["Sitio web"]);
    await expect(setOpportunityServices(a, o.id, { serviceIds: [sb.id] })).rejects.toThrow(/no existe/);
    await expect(setOpportunityServices(b, o.id, { serviceIds: [] })).rejects.toThrow(/no existe/);
    await expect(setOpportunityServices(agentCtx(a, ["read:all"]), o.id, { serviceIds: [] })).rejects.toThrow();
    await setOpportunityServices(a, o.id, { serviceIds: [] });
    expect(await opportunityServices(a, o.id)).toHaveLength(0);
  });
});

const CHAT = [
  "12/03/24, 09:15 - Los mensajes y las llamadas están cifrados de extremo a extremo.",
  "12/03/24, 09:16 - Juan Pérez: Hola!",
  "¿Arrancamos?",
  "12/03/24, 09:20 - Luciano: Sí, mañana te paso el presupuesto",
  "13/03/24, 18:02 - Juan Pérez: <Multimedia omitido>",
  "13/03/24, 18:05 - Luciano: Recibido 👍",
].join("\n");

describe("CRM · importar chat de WhatsApp", () => {
  it("previsualiza, crea una interacción por día y deduplica al reimportar", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Juan" });
    const pv = await previewWhatsapp(ctx, { text: CHAT });
    expect(pv).toMatchObject({ messages: 4, media: 1, from: "2024-03-12", to: "2024-03-13", days: 2 });
    expect(pv.participants.map((p) => p.name).sort()).toEqual(["Juan Pérez", "Luciano"]);

    const r1 = await importWhatsapp(ctx, { clientId: c.id, text: CHAT, me: "Luciano" });
    expect(r1).toMatchObject({ created: 2, updated: 0, skipped: 0 });
    const rows = await getDb()
      .select()
      .from(schema.interaction)
      .where(and(eq(schema.interaction.clientId, c.id), eq(schema.interaction.kind, "whatsapp")));
    expect(rows).toHaveLength(2);
    const first = rows.find((r) => r.summaryMd.includes("¿Arrancamos?"));
    expect(first?.summaryMd).toContain("**09:16 · Juan Pérez:** Hola!");
    expect(first?.summaryMd).toContain("**09:20 · Test:**");
    expect(first?.occurredAt.toISOString()).toBe("2024-03-12T12:16:00.000Z");

    const r2 = await importWhatsapp(ctx, { clientId: c.id, text: CHAT, me: "Luciano" });
    expect(r2).toMatchObject({ created: 0, updated: 0, skipped: 2 });
    // el mismo chat exportado más tarde: el día ampliado se actualiza y el nuevo se crea
    const later = `${CHAT}\n13/03/24, 19:00 - Juan Pérez: Perfecto\n14/03/24, 10:00 - Juan Pérez: ¿Novedades?`;
    const r3 = await importWhatsapp(ctx, { clientId: c.id, text: later, me: "Luciano" });
    expect(r3).toMatchObject({ created: 1, updated: 1, skipped: 1 });
    const all = await getDb().select().from(schema.interaction).where(eq(schema.interaction.clientId, c.id));
    expect(all).toHaveLength(3);
  });

  it("valida formato, participante, cliente y contacto del workspace", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const ca = await createClient(a, { name: "A" });
    const cb = await createClient(b, { name: "B" });
    await expect(previewWhatsapp(a, { text: "esto no es un chat" })).rejects.toThrow(/No encontré mensajes/);
    await expect(importWhatsapp(a, { clientId: ca.id, text: CHAT, me: "Otro" })).rejects.toThrow(/participante/);
    await expect(importWhatsapp(a, { clientId: cb.id, text: CHAT })).rejects.toThrow(/no existe/);
    const [ctB] = await getDb().insert(schema.contact).values({ workspaceId: b.workspaceId, name: "Contacto B" }).returning();
    await expect(importWhatsapp(a, { clientId: ca.id, text: CHAT, contactId: ctB?.id })).rejects.toThrow(/contacto/);
    await expect(importWhatsapp(agentCtx(a, ["read:all"]), { clientId: ca.id, text: CHAT })).rejects.toThrow();
  });
});
