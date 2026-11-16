import { type Ctx, can } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { createClient } from "@agencyos/modules/crm/service";
import { createReceivable } from "@agencyos/modules/finance/service";
import { attachmentsForMany, attachmentsOf } from "@agencyos/modules/library/queries";
import { resolveDownload, uploadFile } from "@agencyos/modules/library/service";
import { createNote, updateNote, updateProjectNote } from "@agencyos/modules/notes/service";
import { addSiteFeedback, attachFeedbackCapture, type PortalCtx, portalProject } from "@agencyos/modules/portal/service";
import { getProjectNote, listProjectFiles, listProjectNotes, projectClientCard, projectFinance } from "@agencyos/modules/projects/related";
import { createProject } from "@agencyos/modules/projects/service";
import { createSite, openRevisionRound } from "@agencyos/modules/sites/service";
import { createTask } from "@agencyos/modules/tasks/service";
import { createTimeEntry } from "@agencyos/modules/time/service";
import { changeRole, listUsers, loadGrants, setMemberGrants } from "@agencyos/modules/users/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

function png(seed: number) {
  // PNG 1×1 válido; el byte de seed cambia el hash (y por lo tanto evita la deduplicación) sin romper la firma.
  const b = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  return Buffer.concat([b, Buffer.from([seed % 256])]);
}

/** Workspace con un colaborador asignado a «mine» y un proyecto ajeno «other» (de otro cliente). */
async function setup() {
  const owner = await makeWorkspace();
  const cli = await createClient(owner, { name: "Cliente Asignado" });
  const cliOther = await createClient(owner, { name: "Cliente Ajeno Zeta" });
  const mine = await createProject(owner, { name: "Proyecto Mío", kind: "website", clientId: cli.id });
  const other = await createProject(owner, { name: "Proyecto Ajeno", kind: "website", clientId: cliOther.id });
  const userId = `u_member_${Math.random().toString(36).slice(2)}`;
  await getDb()
    .insert(schema.user)
    .values({ id: userId, name: "Colab", email: `${userId}@test.local`, emailVerified: true, twoFactorEnabled: true });
  const [m] = await getDb().insert(schema.membership).values({ workspaceId: owner.workspaceId, userId, role: "member" }).returning();
  await getDb().insert(schema.projectMember).values({ workspaceId: owner.workspaceId, projectId: mine.id, userId });
  const member = async (): Promise<Ctx> => ({
    workspaceId: owner.workspaceId,
    userId,
    role: "member",
    actor: { type: "user", id: userId, name: "Colab" },
    grants: await loadGrants(owner.workspaceId, userId, "member"),
  });
  return { owner, cli, cliOther, mine, other, member, membershipId: m?.id ?? "" };
}

describe("permisos extra del colaborador (grants)", () => {
  it("se guardan por workspace, solo para colaboradores y los administra el dueño", async () => {
    const { owner, member, membershipId } = await setup();
    expect((await member()).grants).toEqual([]);
    await setMemberGrants(owner, membershipId, { grants: ["project_finance", "time_rate"] });
    expect((await member()).grants?.sort()).toEqual(["project_finance", "time_rate"]);
    const row = (await listUsers(owner)).find((u) => u.membershipId === membershipId);
    expect(row?.grants.sort()).toEqual(["project_finance", "time_rate"]);
    await expect(setMemberGrants(owner, membershipId, { grants: ["finance_all"] })).rejects.toThrow();
    await expect(setMemberGrants(await member(), membershipId, { grants: [] })).rejects.toThrow(/permiso/);
    // otro workspace: no lo encuentra
    const B = await makeWorkspace();
    await expect(setMemberGrants(B, membershipId, { grants: ["project_crm"] })).rejects.toThrow(/no existe|encontr/i);
    // cambiar de rol descarta los permisos extra; el dueño no se toca
    await changeRole(owner, membershipId, { role: "admin" });
    expect(await loadGrants(owner.workspaceId, (await member()).userId, "member")).toEqual([]);
    await expect(setMemberGrants(owner, membershipId, { grants: ["project_crm"] })).rejects.toThrow(/colaboradores/);
  });

  it("can(): los permisos extra habilitan solo sus recursos y nunca el módulo completo", async () => {
    const { owner, membershipId, member } = await setup();
    const m0 = await member();
    expect(can(m0, "read", "project_finance")).toBe(false);
    expect(can(m0, "read", "project_crm")).toBe(false);
    expect(can(m0, "update", "time_rate")).toBe(false);
    await setMemberGrants(owner, membershipId, { grants: ["project_finance", "project_crm", "time_rate"] });
    const m = await member();
    expect(can(m, "read", "project_finance")).toBe(true);
    expect(can(m, "read", "project_crm")).toBe(true);
    expect(can(m, "update", "time_rate")).toBe(true);
    // nunca el módulo completo ni escritura
    expect(can(m, "read", "finance")).toBe(false);
    expect(can(m, "read", "crm")).toBe(false);
    expect(can(m, "update", "project_finance")).toBe(false);
    // grants inventados o en otro rol no cuentan
    expect(can({ ...m, grants: ["finance"] }, "read", "finance")).toBe(false);
    expect(can({ ...m, role: "client" }, "read", "project_finance")).toBe(false);
  });

  it("finanzas del proyecto: con el permiso ve solo cobros y movimientos de SUS proyectos", async () => {
    const { owner, cli, cliOther, mine, other, member, membershipId } = await setup();
    await createReceivable(owner, { clientId: cli.id, projectId: mine.id, concept: "Anticipo web", amount: "100000", currency: "ARS" });
    await createReceivable(owner, { clientId: cliOther.id, projectId: other.id, concept: "Cobro ajeno Zeta", amount: "999", currency: "ARS" });
    await expect(projectFinance(await member(), mine.id)).rejects.toThrow(/permiso/);
    await setMemberGrants(owner, membershipId, { grants: ["project_finance"] });
    const m = await member();
    const f = await projectFinance(m, mine.id);
    expect(f.receivables.map((r) => r.concept)).toEqual(["Anticipo web"]);
    expect(f.totals).toEqual([{ currency: "ARS", income: "0", expense: "0", pending: "100000.00" }]);
    await expect(projectFinance(m, other.id)).rejects.toThrow(/no existe|encontr/i);
    expect((await projectFinance(owner, other.id)).receivables.map((r) => r.concept)).toEqual(["Cobro ajeno Zeta"]);
  });

  it("CRM del cliente: con el permiso ve la ficha del cliente de SU proyecto (lectura)", async () => {
    const { owner, mine, other, member, membershipId } = await setup();
    await expect(projectClientCard(await member(), mine.id)).rejects.toThrow(/permiso/);
    await setMemberGrants(owner, membershipId, { grants: ["project_crm"] });
    const m = await member();
    expect((await projectClientCard(m, mine.id))?.client.name).toBe("Cliente Asignado");
    await expect(projectClientCard(m, other.id)).rejects.toThrow(/no existe|encontr/i);
  });

  it("horas con tarifa: sin permiso la tarifa se descarta; con permiso se guarda", async () => {
    const { owner, mine, member, membershipId } = await setup();
    const a = await createTimeEntry(await member(), { projectId: mine.id, duration: "60", rate: "20000" });
    expect(a.rate).toBeNull();
    await setMemberGrants(owner, membershipId, { grants: ["time_rate"] });
    const b = await createTimeEntry(await member(), { projectId: mine.id, duration: "60", rate: "20000" });
    expect(b.rate).toBe("20000.00");
  });
});

describe("colaborador: notas y archivos de sus proyectos", () => {
  it("notas: ve y edita las vinculadas a su proyecto; nada fuera", async () => {
    const { owner, mine, other, member } = await setup();
    const own = await createNote(owner, { title: "Brief del proyecto", bodyMd: "Paleta y tono", entityType: "project", entityId: mine.id });
    const mentioned = await createNote(owner, { title: "Reunión kickoff", bodyMd: "Hablamos de #[Proyecto Mío] y del cierre" });
    const foreign = await createNote(owner, { title: "Notas ajenas Zeta", bodyMd: "secreto", entityType: "project", entityId: other.id });
    const loose = await createNote(owner, { title: "Diario personal", bodyMd: "privado" });
    // vínculo manual proyecto → nota
    await getDb()
      .insert(schema.link)
      .values({ workspaceId: owner.workspaceId, fromType: "project", fromId: mine.id, toType: "note", toId: loose.id, kind: "related" });
    const m = await member();
    const list = (await listProjectNotes(m, mine.id)).map((n) => n.id).sort();
    expect(list).toContain(own.id);
    expect(list).toContain(loose.id);
    expect(list).not.toContain(foreign.id);
    expect(list).toContain(mentioned.id); // mención #[Proyecto] → link note → project
    await expect(listProjectNotes(m, other.id)).rejects.toThrow(/no existe|encontr/i);
    expect(await getProjectNote(m, mine.id, foreign.id)).toBeNull();
    expect((await getProjectNote(m, mine.id, own.id))?.bodyMd).toBe("Paleta y tono");
    // edición del cuerpo
    const r = await updateProjectNote(m, mine.id, own.id, { bodyMd: "Paleta, tono y tipografías" });
    expect(r.note.bodyMd).toBe("Paleta, tono y tipografías");
    await expect(updateProjectNote(m, mine.id, foreign.id, { bodyMd: "hack" })).rejects.toThrow(/no existe|encontr/i);
    await expect(updateProjectNote(m, other.id, foreign.id, { bodyMd: "hack" })).rejects.toThrow(/no existe|encontr/i);
    // el módulo Notas completo le sigue vedado
    await expect(updateNote(m, own.id, { bodyMd: "x" })).rejects.toThrow(/permiso/);
    // otro workspace no ve nada
    const B = await makeWorkspace();
    await expect(listProjectNotes(B, mine.id)).rejects.toThrow(/no existe|encontr/i);
  });

  it("archivos: los del proyecto, sus tareas y su sitio; descarga solo de esos", async () => {
    const { owner, mine, other, member } = await setup();
    const task = await createTask(owner, { title: "Armar header", projectId: mine.id });
    const site = await createSite(owner, { name: "Sitio mío", projectId: mine.id });
    const { file: byProject } = await uploadFile(owner, "brief.pdf", Buffer.from("%PDF-1.4\nbrief\n"), { projectId: mine.id });
    const { file: onTask } = await uploadFile(owner, "header.png", png(1), { attachType: "task", attachId: task.id });
    const { file: onSite } = await uploadFile(owner, "mapa.pdf", Buffer.from("%PDF-1.4\nmapa\n"), { siteId: site.id });
    const { file: foreign } = await uploadFile(owner, "ajeno.pdf", Buffer.from("%PDF-1.4\najeno\n"), { projectId: other.id });
    const { file: loose } = await uploadFile(owner, "suelto.pdf", Buffer.from("%PDF-1.4\nsuelto\n"));
    const m = await member();
    const ids = (await listProjectFiles(m, mine.id)).map((f) => f.id);
    expect(ids.sort()).toEqual([byProject.id, onTask.id, onSite.id].sort());
    await expect(listProjectFiles(m, other.id)).rejects.toThrow(/no existe|encontr/i);
    expect(await resolveDownload(m, onTask.id)).not.toBeNull();
    expect(await resolveDownload(m, onSite.id)).not.toBeNull();
    expect(await resolveDownload(m, foreign.id)).toBeNull();
    expect(await resolveDownload(m, loose.id)).toBeNull();
    expect((await attachmentsOf(m, "task", task.id)).map((a) => a.fileId)).toEqual([onTask.id]);
    // el dueño ve todo lo del proyecto también desde la pestaña
    expect((await listProjectFiles(owner, mine.id)).length).toBe(3);
  });
});

describe("portal: captura en el feedback", () => {
  async function portalSetup() {
    const s = await setup();
    const site = await createSite(s.owner, { name: "Sitio Asignado", projectId: s.mine.id });
    const siteZ = await createSite(s.owner, { name: "Sitio Zeta", projectId: s.other.id });
    await openRevisionRound(s.owner, site.id);
    const roundZ = await openRevisionRound(s.owner, siteZ.id);
    const userId = `u_client_${Math.random().toString(36).slice(2)}`;
    await getDb()
      .insert(schema.user)
      .values({ id: userId, name: "Clienta", email: `${userId}@test.local`, emailVerified: true });
    await getDb().insert(schema.membership).values({ workspaceId: s.owner.workspaceId, userId, role: "client" });
    const pc: PortalCtx = {
      workspaceId: s.owner.workspaceId,
      userId,
      role: "client",
      actor: { type: "user", id: userId, name: "Clienta" },
      clientId: s.cli.id,
    };
    return { ...s, site, siteZ, roundZ, pc };
  }

  it("adjunta PNG/JPG/WebP ≤ 10 MB al ítem de SU ronda; se ve en Revisiones interna", async () => {
    const { owner, mine, pc, site } = await portalSetup();
    const item = await addSiteFeedback(pc, mine.id, { description: "El logo se ve pixelado" });
    const r = await attachFeedbackCapture(pc, item?.id ?? "", "captura.png", png(7));
    const shots = await attachmentsForMany(owner, "revision_item", [item?.id ?? ""]);
    expect(shots.get(item?.id ?? "")?.map((a) => a.fileId)).toEqual([r.fileId]);
    const [f] = await getDb().select().from(schema.file).where(eq(schema.file.id, r.fileId));
    expect(f).toMatchObject({ projectId: mine.id, siteId: site.id, mime: "image/png" });
    const [ri] = await getDb()
      .select()
      .from(schema.revisionItem)
      .where(eq(schema.revisionItem.id, item?.id ?? ""));
    expect(ri?.screenshotFileId).toBe(r.fileId);
    expect((await portalProject(pc, mine.id))?.site?.openRound?.items[0]?.captures).toBe(1);
    const [ev] = await getDb()
      .select()
      .from(schema.domainEvent)
      .where(and(eq(schema.domainEvent.workspaceId, owner.workspaceId), eq(schema.domainEvent.type, "revision.captura_cliente")));
    expect(ev?.entityId).toBe(site.id);
  });

  it("rechaza otros tipos, más de 10 MB e ítems de rondas ajenas o cerradas", async () => {
    const { owner, mine, pc, other, roundZ } = await portalSetup();
    const item = await addSiteFeedback(pc, mine.id, { description: "Falta el teléfono" });
    const id = item?.id ?? "";
    await expect(attachFeedbackCapture(pc, id, "doc.pdf", Buffer.from("%PDF-1.4\nx\n"))).rejects.toThrow(/PNG, JPG o WebP/);
    await expect(attachFeedbackCapture(pc, id, "falso.png", Buffer.from("no soy png"))).rejects.toThrow();
    await expect(attachFeedbackCapture(pc, id, "grande.png", Buffer.alloc(10 * 1024 * 1024 + 1))).rejects.toThrow(/10 MB/);
    // ítem de la ronda del sitio de otro cliente (cargado por el dueño): 404 aunque adivine el id
    const { addRevisionItem, closeRevisionRound, setRevisionItemStatus } = await import("@agencyos/modules/sites/service");
    const foreign = await addRevisionItem(owner, roundZ.id, { description: "Ítem ajeno", priority: 3 });
    await expect(attachFeedbackCapture(pc, foreign?.id ?? "", "c.png", png(2))).rejects.toThrow(/no existe|encontr/i);
    // otro cliente del mismo workspace tampoco puede adjuntar al ítem de este
    const pcZ: PortalCtx = { ...pc, clientId: other.clientId };
    await expect(attachFeedbackCapture(pcZ, id, "c.png", png(3))).rejects.toThrow(/no existe|encontr/i);
    // ronda cerrada
    const [ri] = await getDb().select().from(schema.revisionItem).where(eq(schema.revisionItem.id, id));
    await setRevisionItemStatus(owner, id, "resolved");
    await closeRevisionRound(owner, ri?.roundId ?? "");
    await expect(attachFeedbackCapture(pc, id, "c.png", png(4))).rejects.toThrow(/no existe|encontr/i);
    // otro workspace
    const B = await makeWorkspace();
    await expect(attachFeedbackCapture({ ...pc, workspaceId: B.workspaceId }, id, "c.png", png(5))).rejects.toThrow(/no existe|encontr/i);
  });
});
