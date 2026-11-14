import { addDays, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { addComment } from "@agencyos/modules/collab/service";
import { uploadFile } from "@agencyos/modules/library/service";
import {
  addSiteFeedback,
  decideDeliverable,
  decidePortalQuote,
  isFileShared,
  type PortalCtx,
  portalHome,
  portalProject,
  portalQuote,
  portalQuotes,
  resolveSharedFile,
  setFileShared,
  sharedFiles,
} from "@agencyos/modules/portal/service";
import { addDeliverable, addPhase, createProject, setDeliverableStatus } from "@agencyos/modules/projects/service";
import { createQuote, markSent } from "@agencyos/modules/quotes/service";
import { createSite, openRevisionRound } from "@agencyos/modules/sites/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dispatchOutbox } from "../../apps/worker/src/jobs";
import { makeWorkspace } from "./helpers";

const today = todayAR();

async function setup() {
  const owner = await makeWorkspace();
  const [mine] = await getDb().insert(schema.client).values({ workspaceId: owner.workspaceId, name: "Panadería Sol", status: "active" }).returning();
  const [other] = await getDb().insert(schema.client).values({ workspaceId: owner.workspaceId, name: "Otro Cliente Zeta", status: "active" }).returning();
  if (!mine || !other) throw new Error("clientes");
  const p = await createProject(owner, { name: "Web Sol", clientId: mine.id, kind: "website" });
  const pOther = await createProject(owner, { name: "Web Zeta", clientId: other.id, kind: "website" });
  await addPhase(owner, p.id, { name: "Diseño" });
  const userId = `u_client_${Math.random().toString(36).slice(2)}`;
  await getDb()
    .insert(schema.user)
    .values({ id: userId, name: "Sofía Sol", email: `${userId}@test.local`, emailVerified: true });
  await getDb().insert(schema.membership).values({ workspaceId: owner.workspaceId, userId, role: "client" });
  const pc: PortalCtx = { workspaceId: owner.workspaceId, userId, role: "client", actor: { type: "user", id: userId, name: "Sofía Sol" }, clientId: mine.id };
  return { owner, mine, other, p, pOther, pc };
}

describe("portal de clientes", () => {
  it("inicio y ficha: solo sus proyectos, sin comentarios internos", async () => {
    const { owner, p, pOther, pc } = await setup();
    await addComment(owner, "project", p.id, "Nota interna: cobrar extra");
    const home = await portalHome(pc);
    expect(home.clientName).toBe("Panadería Sol");
    expect(home.projects.map((x) => x.id)).toEqual([p.id]);
    expect(home.projects[0]?.currentPhase).toBe("Diseño");
    expect(await portalProject(pc, pOther.id)).toBeNull();
    const detail = await portalProject(pc, p.id);
    expect(JSON.stringify(detail)).not.toContain("cobrar extra");
    expect(detail?.phases.map((ph) => ph.name)).toEqual(["Diseño"]);
  });

  it("aprobar y pedir cambios: actualiza la entrega, registra evento y notifica al dueño", async () => {
    const { owner, p, pOther, pc } = await setup();
    const d1 = await addDeliverable(owner, p.id, { title: "Maqueta home" });
    const d2 = await addDeliverable(owner, p.id, { title: "Maqueta contacto" });
    const dz = await addDeliverable(owner, pOther.id, { title: "Ajena" });
    // pendiente: todavía no se puede aprobar
    await expect(decideDeliverable(pc, d1?.id ?? "", { decision: "approve" })).rejects.toThrow(/esperando/);
    await setDeliverableStatus(owner, d1?.id ?? "", "delivered");
    await setDeliverableStatus(owner, d2?.id ?? "", "delivered");
    await setDeliverableStatus(owner, dz?.id ?? "", "delivered");
    await expect(decideDeliverable(pc, dz?.id ?? "", { decision: "approve" })).rejects.toThrow(/no existe|encontr/i);
    await expect(decideDeliverable(pc, d2?.id ?? "", { decision: "changes" })).rejects.toThrow();
    expect((await decideDeliverable(pc, d1?.id ?? "", { decision: "approve" }))?.status).toBe("approved");
    expect((await decideDeliverable(pc, d2?.id ?? "", { decision: "changes", comment: "Cambiar el logo" }))?.status).toBe("changes_requested");
    const evs = await getDb().select().from(schema.domainEvent).where(eq(schema.domainEvent.workspaceId, owner.workspaceId));
    expect(evs.map((e) => e.type)).toEqual(expect.arrayContaining(["entrega.aprobada_por_cliente", "entrega.cambios_pedidos"]));
    await dispatchOutbox();
    const notes = await getDb()
      .select()
      .from(schema.notification)
      .where(and(eq(schema.notification.workspaceId, owner.workspaceId), eq(schema.notification.userId, owner.userId ?? "")));
    expect(notes.map((n) => n.type)).toEqual(expect.arrayContaining(["entrega.aprobada_por_cliente", "entrega.cambios_pedidos"]));
    expect(notes.some((n) => n.title.includes("Cambiar el logo"))).toBe(true);
  });

  it("feedback de revisión: solo en la ronda abierta del sitio de su proyecto", async () => {
    const { owner, p, pOther, pc } = await setup();
    const site = await createSite(owner, { name: "Sitio Sol", projectId: p.id });
    const siteZ = await createSite(owner, { name: "Sitio Zeta", projectId: pOther.id });
    await expect(addSiteFeedback(pc, p.id, { description: "El botón no se ve" })).rejects.toThrow(/ronda/);
    await openRevisionRound(owner, site.id);
    await openRevisionRound(owner, siteZ.id);
    const item = await addSiteFeedback(pc, p.id, { pageRef: "Inicio", description: "El botón no se ve", priority: "2" });
    expect(item?.priority).toBe(2);
    await expect(addSiteFeedback(pc, pOther.id, { description: "x" })).rejects.toThrow();
    const detail = await portalProject(pc, p.id);
    expect(detail?.site?.openRound?.items.map((i) => i.description)).toEqual(["El botón no se ve"]);
    const [ev] = await getDb()
      .select()
      .from(schema.domainEvent)
      .where(and(eq(schema.domainEvent.workspaceId, owner.workspaceId), eq(schema.domainEvent.type, "revision.feedback_cliente")));
    expect(ev?.entityId).toBe(site.id);
  });

  it("recursos compartidos: solo los marcados y de su cliente; descarga con URL firmada", async () => {
    const { owner, p, pOther, pc, other } = await setup();
    const { file: shared } = await uploadFile(owner, "logo.png", pngBytes(), { projectId: p.id, dedupe: "0" });
    const { file: hidden } = await uploadFile(owner, "interno.pdf", Buffer.from("%PDF-1.4\ninterno\n"), { projectId: p.id });
    const { file: foreign } = await uploadFile(owner, "zeta.pdf", Buffer.from("%PDF-1.4\nzeta\n"), { projectId: pOther.id, clientId: other.id });
    const { file: loose } = await uploadFile(owner, "suelto.pdf", Buffer.from("%PDF-1.4\nsuelto\n"));
    await setFileShared(owner, shared.id, true);
    await setFileShared(owner, foreign.id, true);
    await expect(setFileShared(owner, loose.id, true)).rejects.toThrow(/Vinculá/);
    expect(await isFileShared(owner, shared.id)).toBe(true);
    const list = await sharedFiles(pc);
    expect(list.map((f) => f.id)).toEqual([shared.id]);
    expect(list.map((f) => f.id)).not.toContain(hidden.id);
    const url = new URL(list[0]?.url ?? "", "http://x");
    expect((await resolveSharedFile(pc, shared.id, url.searchParams)).ok).toBe(true);
    expect((await resolveSharedFile(pc, shared.id, new URLSearchParams())).ok).toBe(false);
    const forged = new URL(`/portal/archivos/${foreign.id}${url.search}`, "http://x");
    expect((await resolveSharedFile(pc, foreign.id, forged.searchParams)).ok).toBe(false);
    await setFileShared(owner, shared.id, false);
    expect(await sharedFiles(pc)).toEqual([]);
  });

  it("presupuestos: ve los enviados de su cliente y acepta con la lógica del enlace público", async () => {
    const { owner, mine, other, pc } = await setup();
    const mk = (clientId: string, title: string) =>
      createQuote(owner, {
        clientId,
        title,
        currency: "ARS",
        issueDate: today,
        validUntil: addDays(today, 15),
        items: [{ description: "Sitio", quantity: "1", unitPrice: "100000" }],
      });
    const draft = await mk(mine.id, "Borrador");
    const q = await mk(mine.id, "Sitio institucional");
    const qz = await mk(other.id, "De otro");
    await markSent(owner, q.id);
    await markSent(owner, qz.id);
    const list = await portalQuotes(pc);
    expect(list.map((x) => x.id)).toEqual([q.id]);
    expect(await portalQuote(pc, draft.id)).toBeNull();
    expect(await portalQuote(pc, qz.id)).toBeNull();
    expect((await portalQuote(pc, q.id))?.quote.status).toBe("viewed");
    await expect(decidePortalQuote(pc, qz.id, { decision: "accepted", signerName: "Sofía Sol", agree: "on" })).rejects.toThrow();
    await decidePortalQuote(pc, q.id, { decision: "accepted", signerName: "Sofía Sol", agree: "on" });
    const [after] = await getDb().select().from(schema.quote).where(eq(schema.quote.id, q.id));
    expect(after?.status).toBe("accepted");
    const [dec] = await getDb().select().from(schema.quoteDecision).where(eq(schema.quoteDecision.quoteId, q.id));
    expect(dec?.signerName).toBe("Sofía Sol");
  });

  it("sin cliente asignado o con otro rol: no entra", async () => {
    const { pc, p } = await setup();
    await expect(portalHome({ ...pc, clientId: null })).rejects.toThrow(/cliente asignado/);
    await expect(portalHome({ ...pc, role: "member" })).rejects.toThrow(/permiso/);
    await expect(portalProject({ ...pc, role: "owner" }, p.id)).rejects.toThrow(/permiso/);
  });

  it("aislamiento A/B: un cliente de A no ve nada de B aunque adivine ids", async () => {
    const a = await setup();
    const b = await setup();
    const db = await addDeliverable(b.owner, b.p.id, { title: "De B" });
    await setDeliverableStatus(b.owner, db?.id ?? "", "delivered");
    expect(await portalProject(a.pc, b.p.id)).toBeNull();
    await expect(decideDeliverable(a.pc, db?.id ?? "", { decision: "approve" })).rejects.toThrow();
    // aunque el clientId apunte a un cliente de B, el workspace del contexto manda
    expect((await portalHome({ ...a.pc, clientId: b.mine.id })).projects).toEqual([]);
  });
});

function pngBytes() {
  // PNG 1×1 válido
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
}
