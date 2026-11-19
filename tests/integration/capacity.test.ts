import { addDays } from "@agencyos/core";
import { weekLoad } from "@agencyos/modules/tasks/capacity";
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
