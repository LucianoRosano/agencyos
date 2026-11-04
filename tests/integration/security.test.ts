import { can } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { capture } from "@agencyos/modules/inbox/service";
import { addDeliverable, addPhase, createProject } from "@agencyos/modules/projects/service";
import { createTask, setTaskStatus, updateTask } from "@agencyos/modules/tasks/service";
import { describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

/** Regresiones de la revisión de seguridad (aislamiento por ids recibidos del cliente). */
describe("seguridad: ids de otro workspace", () => {
  it("no se puede asignar un cliente, espacio o proyecto ajeno", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const [clientB] = await getDb().insert(schema.client).values({ workspaceId: b.workspaceId, name: "Cliente de B" }).returning();
    const projectB = await createProject(b, { name: "Proyecto de B" });
    await expect(createProject(a, { name: "X", clientId: clientB?.id })).rejects.toThrow(/cliente/i);
    await expect(createProject(a, { name: "X", spaceId: b.spaces[0]?.id })).rejects.toThrow(/espacio/i);
    await expect(addDeliverable(a, projectB.id, { title: "Entrega intrusa" })).rejects.toThrow(/proyecto/i);
    await expect(addPhase(a, projectB.id, { name: "Etapa intrusa" })).rejects.toThrow(/proyecto/i);
    await expect(createTask(a, { title: "t", spaceId: b.spaces[0]?.id })).rejects.toThrow(/espacio/i);
    await expect(capture(a, { text: "x", spaceId: b.spaces[0]?.id })).rejects.toThrow(/espacio/i);
  });

  it("subtareas: no a sí misma ni dos niveles; estados inválidos rechazados", async () => {
    const ctx = await makeWorkspace();
    const parent = await createTask(ctx, { title: "Padre" });
    const child = await createTask(ctx, { title: "Hija", parentTaskId: parent.id });
    const other = await createTask(ctx, { title: "Otra" });
    await expect(updateTask(ctx, parent.id, { parentTaskId: parent.id })).rejects.toThrow();
    await expect(updateTask(ctx, other.id, { parentTaskId: child.id })).rejects.toThrow(/un solo nivel/);
    // biome-ignore lint/suspicious/noExplicitAny: estado inválido a propósito
    await expect(setTaskStatus(ctx, other.id, "hackeado" as any)).rejects.toThrow();
  });

  it("un token MCP nunca puede más que el rol de quien lo creó", async () => {
    const owner = await makeWorkspace();
    const asMemberToken = agentCtx({ ...owner, role: "member" }, ["read:all", "write:finance"]);
    expect(can(asMemberToken, "read", "finance")).toBe(false);
    expect(can(asMemberToken, "read", "project")).toBe(true);
    const asOwnerToken = agentCtx(owner, ["read:all"]);
    expect(can(asOwnerToken, "read", "finance")).toBe(true);
    expect(can(asOwnerToken, "delete", "project")).toBe(false);
  });
});
