import type { Ctx } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { listClients } from "@agencyos/modules/crm/queries";
import { createClient } from "@agencyos/modules/crm/service";
import { getProject, listProjects } from "@agencyos/modules/projects/queries";
import { createProject } from "@agencyos/modules/projects/service";
import { canSwitchTo, createWorkspace, listMyWorkspaces, resolveActiveMembership } from "@agencyos/modules/workspaces/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

/** Contexto del mismo usuario en otro workspace (como lo arma requireCtx tras validar la membership). */
const inWorkspace = (base: Ctx, workspaceId: string): Ctx => ({ ...base, workspaceId });

describe("varios espacios de trabajo del mismo usuario", () => {
  it("el dueño crea uno nuevo: queda dueño, sembrado con la estructura inicial y en su lista", async () => {
    const A = await makeWorkspace("Agencia");
    const ws = await createWorkspace(A, { name: "Personal" });
    const [m] = await getDb()
      .select()
      .from(schema.membership)
      .where(and(eq(schema.membership.workspaceId, ws.id), eq(schema.membership.userId, A.userId ?? "")));
    expect(m?.role).toBe("owner");
    const spaces = await getDb().select().from(schema.space).where(eq(schema.space.workspaceId, ws.id));
    expect(spaces.length).toBeGreaterThan(0);
    const ledgers = await getDb().select().from(schema.ledger).where(eq(schema.ledger.workspaceId, ws.id));
    expect(ledgers.length).toBeGreaterThan(0);
    expect((await listMyWorkspaces(A.userId ?? "")).map((w) => w.name)).toEqual(["Agencia", "Personal"]);
    await expect(createWorkspace(A, { name: "" })).rejects.toThrow();
  });

  it("solo el dueño crea; admin, colaborador, cliente y agentes no", async () => {
    const A = await makeWorkspace();
    for (const role of ["admin", "member", "client"] as const) await expect(createWorkspace({ ...A, role }, { name: "X" })).rejects.toThrow(/dueño/);
    await expect(createWorkspace({ ...A, actor: { type: "agent", id: "t", name: "MCP" }, scopes: ["read:all"] }, { name: "X" })).rejects.toThrow(/dueño/);
  });

  it("aislamiento: lo de un workspace no se ve ni se toca desde el otro", async () => {
    const A = await makeWorkspace("Agencia");
    const ws = await createWorkspace(A, { name: "Segunda marca" });
    const B = inWorkspace(A, ws.id);
    const pA = await createProject(A, { name: "Proyecto de la agencia" });
    const pB = await createProject(B, { name: "Proyecto de la marca" });
    await createClient(A, { name: "Cliente de la agencia" });
    expect((await listProjects(A)).map((r) => r.p.id)).toContain(pA.id);
    expect((await listProjects(A)).map((r) => r.p.id)).not.toContain(pB.id);
    expect((await listProjects(B)).map((r) => r.p.id)).toEqual([pB.id]);
    expect(await getProject(B, pA.id)).toBeNull();
    expect(await listClients(B)).toEqual([]);
    // un id del otro workspace no se puede asignar
    await expect(createProject(B, { name: "Mezcla", clientId: (await createClient(A, { name: "Otro" })).id })).rejects.toThrow(/no existe|encontr/i);
  });

  it("workspace activo: la cookie solo elige entre memberships activas; si no, cae al primero", async () => {
    const A = await makeWorkspace("Agencia");
    const userId = A.userId ?? "";
    const ws = await createWorkspace(A, { name: "Personal" });
    const ajeno = await makeWorkspace("Ajeno");
    expect((await resolveActiveMembership(userId, ws.id))?.w.id).toBe(ws.id);
    expect((await resolveActiveMembership(userId, null))?.w.id).toBe(A.workspaceId);
    // cookie manipulada con un workspace ajeno o basura: no da acceso
    expect((await resolveActiveMembership(userId, ajeno.workspaceId))?.w.id).toBe(A.workspaceId);
    expect((await resolveActiveMembership(userId, "no-es-uuid"))?.w.id).toBe(A.workspaceId);
    expect(await canSwitchTo(userId, ajeno.workspaceId)).toBeNull();
    expect(await canSwitchTo(userId, ws.id)).toEqual({ role: "owner" });
    // acceso desactivado: deja de poder elegirse
    await getDb()
      .update(schema.membership)
      .set({ status: "disabled" })
      .where(and(eq(schema.membership.workspaceId, ws.id), eq(schema.membership.userId, userId)));
    expect((await resolveActiveMembership(userId, ws.id))?.w.id).toBe(A.workspaceId);
    expect(await canSwitchTo(userId, ws.id)).toBeNull();
    expect((await listMyWorkspaces(userId)).map((w) => w.id)).toEqual([A.workspaceId]);
  });
});
