import { randomUUID } from "node:crypto";
import { addDays, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { createClient } from "@agencyos/modules/crm/service";
import { createNote, updateNote } from "@agencyos/modules/notes/service";
import { applyMutations, pullSnapshot } from "@agencyos/modules/offline/service";
import { createTask, setTaskStatus } from "@agencyos/modules/tasks/service";
import { moveToTrash } from "@agencyos/modules/trash/service";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("modo sin conexión: copia (pull)", () => {
  it("completa con lo de uso diario e incremental con cambios y borrados", async () => {
    const ws = await makeWorkspace();
    const open = await createTask(ws, { title: "Abierta", dueDate: todayAR() });
    const done = await createTask(ws, { title: "Hecha" });
    await setTaskStatus(ws, done.id, "done");
    await createNote(ws, { title: "Nota uno", bodyMd: "hola" });
    await createClient(ws, { name: "Cliente offline" });
    const snap = await pullSnapshot(ws);
    expect(snap.full).toBe(true);
    expect(snap.tasks.map((t) => t.title).sort()).toEqual(["Abierta", "Hecha"]);
    expect(snap.notes[0]).toMatchObject({ title: "Nota uno", bodyMd: "hola", truncated: false });
    expect(snap.clients.map((c) => c.name)).toContain("Cliente offline");
    expect(snap.spaces.length).toBeGreaterThan(0);

    await wait(20);
    const since = snap.serverTime;
    await wait(20);
    await moveToTrash(ws, "task", open.id);
    await createTask(ws, { title: "Nueva" });
    const inc = await pullSnapshot(ws, { since });
    expect(inc.full).toBe(false);
    expect(inc.tasks.map((t) => t.title)).toContain("Nueva");
    expect(inc.tasks.map((t) => t.title)).not.toContain("Hecha");
    expect(inc.removed.task).toContain(open.id);

    // aislamiento y permisos: otro workspace no ve nada; un colaborador no recibe notas ni clientes
    const other = await makeWorkspace("B");
    expect((await pullSnapshot(other)).tasks).toEqual([]);
    const member = await pullSnapshot({ ...ws, role: "member" });
    expect(member.notes).toEqual([]);
    expect(member.clients).toEqual([]);
  });
});

describe("modo sin conexión: cola de cambios (push)", () => {
  it("aplica una sola vez, con ids del dispositivo, y rechaza lo inválido", async () => {
    const ws = await makeWorkspace();
    const taskId = randomUUID();
    const muts = [
      { id: randomUUID(), type: "task.create", entityId: taskId, data: { title: "Desde el celular", dueDate: addDays(todayAR(), 1) } },
      { id: randomUUID(), type: "task.status", entityId: taskId, data: { status: "done" } },
      { id: randomUUID(), type: "inbox.capture", data: { text: "Idea en el colectivo" } },
      { id: randomUUID(), type: "task.status", entityId: randomUUID(), data: { status: "done" } },
    ];
    const r1 = await applyMutations(ws, { mutations: muts });
    expect(r1.map((r) => r.status)).toEqual(["applied", "applied", "applied", "rejected"]);
    // reenvío (sin respuesta por corte de señal): no duplica
    const r2 = await applyMutations(ws, { mutations: muts });
    expect(r2.every((r) => r.duplicate)).toBe(true);
    const tasks = await getDb().select().from(schema.task).where(eq(schema.task.workspaceId, ws.workspaceId));
    expect(tasks.filter((t) => t.title === "Desde el celular")).toHaveLength(1);
    expect(tasks.find((t) => t.id === taskId)?.status).toBe("done");
    const inbox = await getDb().select().from(schema.inboxItem).where(eq(schema.inboxItem.workspaceId, ws.workspaceId));
    expect(inbox.filter((i) => i.text === "Idea en el colectivo")).toHaveLength(1);
    // otro usuario no puede reusar el id de un cambio ajeno
    const other = await makeWorkspace("B");
    const r3 = await applyMutations(other, { mutations: [muts[2]] });
    expect(r3[0]?.status).toBe("rejected");
  });

  it("notas: edita si nadie la cambió; si cambió en otro dispositivo guarda una copia de conflicto", async () => {
    const ws = await makeWorkspace();
    const n = await createNote(ws, { title: "Plan", bodyMd: "v1" });
    const base = n.updatedAt.toISOString();
    const ok = await applyMutations(ws, { mutations: [{ id: randomUUID(), type: "note.update", entityId: n.id, base, data: { bodyMd: "v2 offline" } }] });
    expect(ok[0]?.status).toBe("applied");
    // la nota cambia en la PC después de la copia que tenía el celular
    await wait(1100);
    await updateNote(ws, n.id, { bodyMd: "v3 en la PC" });
    const conflict = await applyMutations(ws, {
      mutations: [{ id: randomUUID(), type: "note.update", entityId: n.id, base, data: { bodyMd: "v2b celular" } }],
    });
    expect(conflict[0]?.status).toBe("conflict");
    expect(conflict[0]?.message).toMatch(/otro dispositivo/);
    const notes = await getDb().select().from(schema.note).where(eq(schema.note.workspaceId, ws.workspaceId));
    expect(notes.find((x) => x.id === n.id)?.bodyMd).toBe("v3 en la PC");
    expect(notes.some((x) => x.title.startsWith("Plan (conflicto") && x.bodyMd === "v2b celular")).toBe(true);
    // nota nueva con título repetido: se guarda con otro nombre
    const dup = await applyMutations(ws, {
      mutations: [{ id: randomUUID(), type: "note.create", entityId: randomUUID(), data: { title: "Plan", bodyMd: "otra" } }],
    });
    expect(dup[0]?.status).toBe("conflict");
    expect(dup[0]?.message).toMatch(/Plan \(2\)/);
  });
});
