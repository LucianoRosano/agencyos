import type { Ctx } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { addComment, listComments } from "@agencyos/modules/collab/service";
import { createClient, updateClient } from "@agencyos/modules/crm/service";
import { getProject, listProjects } from "@agencyos/modules/projects/queries";
import { addDeliverable, createProject, setDeliverableStatus, setNextAction, updateProject } from "@agencyos/modules/projects/service";
import { globalSearch } from "@agencyos/modules/search/service";
import { getSite, listSites } from "@agencyos/modules/sites/queries";
import { addRequirement, createSite, updateSite } from "@agencyos/modules/sites/service";
import { getTask, listTasks, taskCounts } from "@agencyos/modules/tasks/queries";
import { createTask, setTaskStatus, updateTask } from "@agencyos/modules/tasks/service";
import { getMemberToday, getToday } from "@agencyos/modules/today/queries";
import { moveToTrash } from "@agencyos/modules/trash/service";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

/** Colaborador con un proyecto asignado (mine) y otro ajeno (other) en el mismo workspace. */
async function setup() {
  const owner = await makeWorkspace();
  const cli = await createClient(owner, { name: "Cliente Secreto" });
  const mine = await createProject(owner, { name: "Proyecto Asignado", kind: "website" });
  const other = await createProject(owner, { name: "Proyecto Ajeno Zeta", kind: "website", clientId: cli.id });
  const userId = `u_member_${Math.random().toString(36).slice(2)}`;
  await getDb()
    .insert(schema.user)
    .values({ id: userId, name: "Colab", email: `${userId}@test.local`, emailVerified: true, twoFactorEnabled: true });
  await getDb().insert(schema.membership).values({ workspaceId: owner.workspaceId, userId, role: "member" });
  await getDb().insert(schema.projectMember).values({ workspaceId: owner.workspaceId, projectId: mine.id, userId });
  const member: Ctx = { workspaceId: owner.workspaceId, userId, role: "member", actor: { type: "user", id: userId, name: "Colab" } };
  const myTask = await createTask(owner, { title: "Tarea mía", projectId: mine.id, dueDate: new Date().toISOString().slice(0, 10) });
  const otherTask = await createTask(owner, { title: "Tarea ajena Zeta", projectId: other.id });
  const looseTask = await createTask(owner, { title: "Tarea personal del dueño Zeta" });
  return { owner, member, cli, mine, other, myTask, otherTask, looseTask };
}

describe("colaborador (member): solo sus proyectos asignados", () => {
  it("listas, ficha por URL directa, tareas y contadores", async () => {
    const { member, mine, other, myTask, otherTask, looseTask } = await setup();
    expect((await listProjects(member)).map((r) => r.p.id)).toEqual([mine.id]);
    expect(await getProject(member, other.id)).toBeNull(); // la página responde 404
    expect((await getProject(member, mine.id))?.p.id).toBe(mine.id);
    const tasks = (await listTasks(member)).map((r) => r.t.id);
    expect(tasks).toContain(myTask.id);
    expect(tasks).not.toContain(otherTask.id);
    expect(tasks).not.toContain(looseTask.id);
    expect(await getTask(member, otherTask.id)).toBeNull();
    expect((await taskCounts(member)).open).toBe(1);
  });

  it("búsqueda global: nada fuera de sus proyectos (ni CRM)", async () => {
    const { member, owner } = await setup();
    expect((await globalSearch(owner, "Zeta")).length).toBeGreaterThan(0);
    expect(await globalSearch(member, "Zeta")).toEqual([]);
    expect(await globalSearch(member, "Secreto")).toEqual([]);
    expect((await globalSearch(member, "Asignado")).map((h) => h.type)).toEqual(["project"]);
  });

  it("Hoy: solo lo suyo; el read-model completo (con dinero y CRM) le está vedado", async () => {
    const { member, mine, myTask } = await setup();
    const d = await getMemberToday(member);
    expect(d.projects.map((p) => p.id)).toEqual([mine.id]);
    expect(d.forToday.map((r) => r.t.id)).toEqual([myTask.id]);
    await expect(getToday(member, { userId: member.userId ?? "" })).rejects.toThrow(/permiso/);
  });

  it("escrituras: trabaja en su proyecto; lo ajeno responde 404 o sin permiso", async () => {
    const { member, mine, other, otherTask, myTask, cli } = await setup();
    await setNextAction(member, mine.id, "Revisar maqueta");
    await expect(setNextAction(member, other.id, "x")).rejects.toThrow(/no existe|encontr/i);
    await expect(createTask(member, { title: "En lo ajeno", projectId: other.id })).rejects.toThrow();
    await expect(createTask(member, { title: "Suelta" })).rejects.toThrow(/proyectos asignados/);
    const t = await createTask(member, { title: "En lo mío", projectId: mine.id });
    expect(t.projectId).toBe(mine.id);
    await expect(updateTask(member, myTask.id, { projectId: other.id })).rejects.toThrow();
    await expect(setTaskStatus(member, otherTask.id, "done")).rejects.toThrow();
    await expect(updateProject(member, mine.id, { name: "Renombrado" })).rejects.toThrow(/permiso/);
    await expect(createProject(member, { name: "Nuevo" })).rejects.toThrow(/permiso/);
    await expect(moveToTrash(member, "task", otherTask.id)).rejects.toThrow();
    await moveToTrash(member, "task", t.id);
    await expect(moveToTrash(member, "project", mine.id)).rejects.toThrow(/permiso/);
    // CRM: vedado
    await expect(updateClient(member, cli.id, { name: "Hack" })).rejects.toThrow(/permiso/);
  });

  it("entregas ajenas: no las puede cambiar", async () => {
    const { owner, member, other, mine } = await setup();
    const d = await addDeliverable(owner, other.id, { title: "Entrega ajena" });
    const dm = await addDeliverable(owner, mine.id, { title: "Entrega mía" });
    await expect(setDeliverableStatus(member, d?.id ?? "", "approved")).rejects.toThrow();
    expect((await setDeliverableStatus(member, dm?.id ?? "", "delivered"))?.status).toBe("delivered");
  });

  it("comentarios: solo en entidades de sus proyectos", async () => {
    const { member, mine, other, cli } = await setup();
    await addComment(member, "project", mine.id, "Listo el header");
    expect(await listComments(member, "project", mine.id)).toHaveLength(1);
    await expect(addComment(member, "project", other.id, "x")).rejects.toThrow();
    await expect(listComments(member, "project", other.id)).rejects.toThrow();
    await expect(addComment(member, "client", cli.id, "x")).rejects.toThrow();
  });

  it("sitios: lista y ficha solo del proyecto asignado; administración del sitio vedada", async () => {
    const { owner, member, mine, other } = await setup();
    const s1 = await createSite(owner, { name: "Web asignada", projectId: mine.id });
    const s2 = await createSite(owner, { name: "Web ajena", projectId: other.id });
    expect((await listSites(member)).map((r) => r.s.id)).toEqual([s1.id]);
    expect(await getSite(member, s2.id)).toBeNull();
    await addRequirement(member, s1.id, { title: "Formulario de contacto", priority: "must" });
    await expect(addRequirement(member, s2.id, { title: "x", priority: "must" })).rejects.toThrow();
    await expect(updateSite(member, s1.id, { name: "Renombrada", projectId: mine.id })).rejects.toThrow(/permiso/);
  });
});

describe("cliente (client): nada de la app interna", () => {
  it("cualquier caso de uso interno responde sin permiso o vacío", async () => {
    const { owner, mine, cli } = await setup();
    const client: Ctx = { ...owner, role: "client", userId: "u_client_x", actor: { type: "user", id: "u_client_x", name: "Cliente" } };
    expect(await listProjects(client)).toEqual([]);
    expect(await getProject(client, mine.id)).toBeNull();
    expect(await listTasks(client)).toEqual([]);
    expect(await globalSearch(client, "Proyecto")).toEqual([]);
    await expect(createTask(client, { title: "x", projectId: mine.id })).rejects.toThrow(/permiso/);
    await expect(setNextAction(client, mine.id, "x")).rejects.toThrow(/permiso/);
    await expect(updateClient(client, cli.id, { name: "x" })).rejects.toThrow(/permiso/);
    await expect(addComment(client, "project", mine.id, "x")).rejects.toThrow(/permiso/);
    await expect(getToday(client, { userId: "u_client_x" })).rejects.toThrow(/permiso/);
  });
});
