import { todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { listTemplates } from "@agencyos/modules/projects/queries";
import { createFromTemplate, createProject, setProjectStatus } from "@agencyos/modules/projects/service";
import { listTasks } from "@agencyos/modules/tasks/queries";
import { createTask, setTaskStatus } from "@agencyos/modules/tasks/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

describe("proyectos y tareas", () => {
  it("el asistente con la plantilla Tienda crea etapas, tareas fechadas y la primera acción en Hoy", async () => {
    const ctx = await makeWorkspace();
    const tpl = (await listTemplates(ctx)).find((t) => t.key === "tienda-online");
    expect(tpl).toBeDefined();
    const p = await createFromTemplate(ctx, { templateId: tpl?.id, name: "Tienda de prueba", definitionOfDone: "Publicada", firstAction: "Llamar al cliente" });
    const phases = await getDb().select().from(schema.projectPhase).where(eq(schema.projectPhase.projectId, p.id));
    expect(phases.length).toBe(9);
    const today = await listTasks(ctx, { view: "hoy" });
    expect(today.some((r) => r.t.title === "Llamar al cliente" && r.t.dueDate === todayAR())).toBe(true);
    expect(p.status).toBe("in_progress");
  });

  it("no permite pasar a «en curso» sin siguiente acción", async () => {
    const ctx = await makeWorkspace();
    const p = await createProject(ctx, { name: "Sin acción" });
    await expect(setProjectStatus(ctx, p.id, "in_progress")).rejects.toThrow(/siguiente acción/);
  });

  it("completar una tarea recurrente crea la siguiente", async () => {
    const ctx = await makeWorkspace();
    const t = await createTask(ctx, { title: "Revisar backups", dueDate: "2030-01-06", rrule: "FREQ=WEEKLY" });
    const r = await setTaskStatus(ctx, t.id, "done");
    expect(r.next?.dueDate).toBe("2030-01-13");
    expect(r.next?.status).toBe("todo");
  });

  it("aislamiento multi-inquilino: A no ve ni borra datos de B", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const tb = await createTask(b, { title: "Secreta de B" });
    const listA = await listTasks(a, { view: "todas" });
    expect(listA.find((r) => r.t.id === tb.id)).toBeUndefined();
    await expect(moveToTrash(a, "task", tb.id)).rejects.toThrow();
    await expect(setTaskStatus(a, tb.id, "done")).rejects.toThrow();
  });

  it("papelera: eliminar y restaurar", async () => {
    const ctx = await makeWorkspace();
    const t = await createTask(ctx, { title: "Borrable" });
    await moveToTrash(ctx, "task", t.id);
    expect((await listTasks(ctx, { view: "todas" })).find((r) => r.t.id === t.id)).toBeUndefined();
    await restoreFromTrash(ctx, "task", t.id);
    expect((await listTasks(ctx, { view: "todas" })).find((r) => r.t.id === t.id)).toBeDefined();
  });

  it("permisos MCP: crear tarea sí, borrar no", async () => {
    const ctx = await makeWorkspace();
    const bot = agentCtx(ctx, ["read:all", "write:tasks"]);
    const t = await createTask(bot, { title: "Desde Claude" });
    expect(t.title).toBe("Desde Claude");
    await expect(moveToTrash(bot, "task", t.id)).rejects.toThrow(/alcance/);
  });
});
