import { addDays, todayAR } from "@agencyos/core";
import { getDb, schema, uuidv7 } from "@agencyos/db";
import { listActivityPage } from "@agencyos/modules/activity/queries";
import { listClientsPage } from "@agencyos/modules/crm/queries";
import { listNotesPage } from "@agencyos/modules/notes/queries";
import { decodeCursor, encodeCursor } from "@agencyos/modules/shared/pagination";
import { listTasks, listTasksPage } from "@agencyos/modules/tasks/queries";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

/** Recorre todas las páginas con `?hasta=` (acumulativo) y devuelve la última lista completa. */
async function walk<T extends { _cursor: string }>(page: (hasta: string | null) => Promise<{ items: T[]; nextCursor: string | null }>) {
  let hasta: string | null = null;
  let items: T[] = [];
  let pages = 0;
  for (;;) {
    const p = await page(hasta);
    // acumulativo: cada página contiene a la anterior como prefijo
    expect(p.items.slice(0, items.length).map((x) => x._cursor)).toEqual(items.map((x) => x._cursor));
    items = p.items;
    pages++;
    if (!p.nextCursor) break;
    hasta = p.nextCursor;
  }
  return { items, pages };
}

describe("paginación por cursor", () => {
  it("tareas: recorre todas las abiertas sin duplicados, con fechas nulas al final y en el mismo orden que sin paginar", async () => {
    const ctx = await makeWorkspace();
    const space = ctx.spaces[0]?.id as string;
    const today = todayAR();
    const rows = Array.from({ length: 57 }, (_, i) => ({
      id: uuidv7(),
      workspaceId: ctx.workspaceId,
      title: `T${i}`,
      spaceId: space,
      status: "todo",
      priority: 1 + (i % 4),
      // misma fecha para muchas (empates), y un tercio sin fecha
      dueDate: i % 3 === 0 ? null : addDays(today, i % 5),
    }));
    await getDb().insert(schema.task).values(rows);
    const full = await listTasks(ctx, { view: "todas", limit: 1000 });
    const { items, pages } = await walk((hasta) => listTasksPage(ctx, { view: "todas", hasta, pageSize: 10 }));
    expect(pages).toBe(6);
    expect(new Set(items.map((x) => x.t.id)).size).toBe(57);
    expect(items.map((x) => x.t.id)).toEqual(full.map((x) => x.t.id));
    expect(items.at(-1)?.t.dueDate).toBeNull();
  });

  it("tareas completadas (desc, nulls first) y estabilidad ante altas nuevas", async () => {
    const ctx = await makeWorkspace();
    const space = ctx.spaces[0]?.id as string;
    const base = Date.now();
    await getDb()
      .insert(schema.task)
      .values(
        Array.from({ length: 25 }, (_, i) => ({
          workspaceId: ctx.workspaceId,
          title: `C${i}`,
          spaceId: space,
          status: "done",
          // microsegundos distintos dentro del mismo milisegundo: el cursor no debe perderlos
          completedAt: i % 6 === 0 ? null : new Date(base - Math.floor(i / 2) * 1000),
        })),
      );
    const first = await listTasksPage(ctx, { view: "completadas", pageSize: 10 });
    expect(first.items).toHaveLength(10);
    // una tarea completada recién: aparece al principio, sin duplicar ni saltear nada al cargar más
    await getDb().insert(schema.task).values({ workspaceId: ctx.workspaceId, title: "Nueva", spaceId: space, status: "done", completedAt: new Date() });
    const { items } = await walk((hasta) => listTasksPage(ctx, { view: "completadas", hasta: hasta ?? first.nextCursor, pageSize: 10 }));
    expect(new Set(items.map((x) => x.t.id)).size).toBe(26);
    expect(items.filter((x) => x.t.completedAt === null)).toHaveLength(5);
  });

  it("clientes, notas y actividad paginan; un cursor manipulado se ignora", async () => {
    const ctx = await makeWorkspace();
    await getDb()
      .insert(schema.client)
      .values(
        Array.from({ length: 23 }, (_, i) => ({
          workspaceId: ctx.workspaceId,
          name: `Cliente ${i}`,
          lastActivityAt: i % 4 ? new Date(Date.now() - i * 60_000) : null,
        })),
      );
    const c = await walk((hasta) => listClientsPage(ctx, { hasta, pageSize: 7 }));
    expect(c.items).toHaveLength(23);
    expect(new Set(c.items.map((x) => x.c.id)).size).toBe(23);

    await getDb()
      .insert(schema.note)
      .values(
        Array.from({ length: 15 }, (_, i) => ({ workspaceId: ctx.workspaceId, title: `N${i}`, slug: `n-${i}`, bodyMd: `# Hola **${i}**`, pinned: i === 3 })),
      );
    const n = await walk((hasta) => listNotesPage(ctx, { hasta, pageSize: 4 }));
    expect(n.items).toHaveLength(15);
    expect(n.items[0]?.title).toBe("N3"); // fijada primero
    expect(n.items[0]?.snippet.trim()).toBe("Hola 3"); // mismo extracto que antes de f_note_snippet

    await getDb()
      .insert(schema.activity)
      .values(
        Array.from({ length: 12 }, (_, i) => ({
          workspaceId: ctx.workspaceId,
          entityType: "task",
          verb: "tarea.creada",
          summary: `A${i}`,
          actorType: "user",
        })),
      );
    const a = await walk((hasta) => listActivityPage(ctx, { hasta, pageSize: 5 }));
    expect(a.items.length).toBeGreaterThanOrEqual(12);

    expect(decodeCursor("no válido!", 2)).toBeNull();
    expect(decodeCursor(encodeCursor('{"a":1}'), 2)).toBeNull();
    expect(decodeCursor(encodeCursor("[1,[2]]"), 2)).toBeNull();
    const bad = await listClientsPage(ctx, { hasta: encodeCursor("[1,2]"), pageSize: 7 });
    expect(bad.items).toHaveLength(7); // cursor de otra forma → primera página
  });
});
