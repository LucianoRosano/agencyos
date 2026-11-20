import { addDays } from "@agencyos/core";
import { capacityAhead, weekLoad } from "@agencyos/modules/tasks/capacity";
import { createTask } from "@agencyos/modules/tasks/service";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

// 2026-11-23 es lunes
const MON = "2026-11-23";

describe("carga de la semana", () => {
  it("suma estimaciones por día, cuenta lo vencido en el primer día y marca fines de semana", async () => {
    const ws = await makeWorkspace();
    await createTask(ws, { title: "A", dueDate: MON, estimateMinutes: 120 });
    await createTask(ws, { title: "B", dueDate: MON, estimateMinutes: 300 });
    await createTask(ws, { title: "C sin estimar", dueDate: addDays(MON, 1) });
    await createTask(ws, { title: "Vencida", dueDate: addDays(MON, -3), estimateMinutes: 60 });
    const done = await createTask(ws, { title: "Hecha", dueDate: MON, estimateMinutes: 999 });
    const { setTaskStatus } = await import("@agencyos/modules/tasks/service");
    await setTaskStatus(ws, done.id, "done");
    const w = await weekLoad({ ...ws, workspace: { settings: { dailyCapacityHours: 7 } } }, { from: MON });
    expect(w).toHaveLength(7);
    expect(w[0]).toMatchObject({ date: MON, minutes: 480, tasks: 3, capacityMinutes: 420, workday: true });
    expect(w[1]).toMatchObject({ minutes: 0, tasks: 1, unestimated: 1 });
    expect(w[5]).toMatchObject({ date: addDays(MON, 5), workday: false, capacityMinutes: 0 });
  });

  it("aislamiento entre workspaces y capacidad por defecto", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    await createTask(a, { title: "Solo A", dueDate: MON, estimateMinutes: 60 });
    const wb = await weekLoad(b, { from: MON });
    expect(wb[0]).toMatchObject({ minutes: 0, tasks: 0, capacityMinutes: 360 });
  });
});

describe("capacidad a futuro", () => {
  it("semanas desde la actual: días hábiles restantes, tareas por semana (vencidas a la primera) y horas de abonos", async () => {
    const ws = await makeWorkspace();
    const { createClient } = await import("@agencyos/modules/crm/service");
    const { createRetainer } = await import("@agencyos/modules/retainers/service");
    const WED = addDays(MON, 2); // miércoles 25/11
    await createTask(ws, { title: "Vencida", dueDate: addDays(MON, -10), estimateMinutes: 60 });
    await createTask(ws, { title: "Esta semana", dueDate: addDays(MON, 4), estimateMinutes: 120 });
    await createTask(ws, { title: "Próxima", dueDate: addDays(MON, 8), estimateMinutes: 600 });
    await createTask(ws, { title: "Sin estimar", dueDate: addDays(MON, 9) });
    const c = await createClient(ws, { name: "Cliente abono" });
    // 21 h en diciembre 2026 (23 días hábiles) y noviembre 2026 (21 días hábiles): 1 h por día hábil en noviembre
    await createRetainer(ws, { clientId: c.id, concept: "Mantenimiento", amount: "10000", hoursIncluded: "21", startDate: "2026-11-01" });
    const w = await capacityAhead({ ...ws, workspace: { settings: { dailyCapacityHours: 6 } } }, { weeks: 3, today: WED });
    expect(w).toHaveLength(3);
    // esta semana: mié, jue, vie = 3 días hábiles
    expect(w[0]).toMatchObject({ start: MON, capacityMinutes: 3 * 360, taskMinutes: 180, tasks: 2, retainerMinutes: 180 });
    expect(w[1]).toMatchObject({ start: addDays(MON, 7), capacityMinutes: 5 * 360, taskMinutes: 600, tasks: 2, unestimated: 1 });
    // semana 30/11–6/12: lunes de noviembre (60 min) + 4 días de diciembre (21 h / 23 días)
    expect(w[1]?.retainerMinutes).toBe(Math.round(60 + (4 * 21 * 60) / 23));
  });
});
