import { clientReportDoc, defaultReportMonth } from "@agencyos/modules/crm/report";
import { createClient } from "@agencyos/modules/crm/service";
import { createProject } from "@agencyos/modules/projects/service";
import { createRetainer } from "@agencyos/modules/retainers/service";
import { createTask, setTaskStatus } from "@agencyos/modules/tasks/service";
import { createTimeEntry } from "@agencyos/modules/time/service";
import { renderClientReportHtml } from "../../packages/pdf/src/client-report"; // @agencyos/pdf no es dependencia de la raíz
import { todayAR } from "@agencyos/core";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

describe("informe mensual del cliente", () => {
  it("junta tareas cerradas del mes, horas, abonos y sale en HTML con la marca", async () => {
    const ws = await makeWorkspace();
    const c = await createClient(ws, { name: "Panadería Sol" });
    const p = await createProject(ws, { name: "Web Sol", clientId: c.id, status: "in_progress", nextAction: "Cargar fotos" });
    const t = await createTask(ws, { title: "Maquetar home", projectId: p.id });
    await setTaskStatus(ws, t.id, "done");
    await createTask(ws, { title: "Abierta", projectId: p.id });
    await createTimeEntry(ws, { projectId: p.id, duration: "2h", date: todayAR() });
    await createRetainer(ws, { clientId: c.id, projectId: p.id, concept: "Mantenimiento", amount: "30000", hoursIncluded: "5" });
    const now = todayAR();
    const doc = await clientReportDoc(ws, c.id, Number(now.slice(0, 4)), Number(now.slice(5, 7)));
    expect(doc.clientName).toBe("Panadería Sol");
    expect(doc.projects).toHaveLength(1);
    expect(doc.projects[0]).toMatchObject({ name: "Web Sol", doneCount: 1, done: ["Maquetar home"], nextAction: "Cargar fotos" });
    expect(doc.minutes).toBe(120);
    expect(doc.retainers[0]).toMatchObject({ concept: "Mantenimiento", minutesUsed: 120 });
    const html = renderClientReportHtml(doc);
    expect(html).toContain("Maquetar home");
    expect(html).toContain("2 h de 5 h");
    expect(html).not.toContain("Abierta");
  });

  it("aislamiento: no se puede pedir el informe de un cliente de otro workspace; colaborador sin CRM no", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const c = await createClient(a, { name: "Solo A" });
    await expect(clientReportDoc(b, c.id, 2026, 11)).rejects.toThrow();
    await expect(clientReportDoc({ ...a, role: "member" }, c.id, 2026, 11)).rejects.toThrow();
  });

  it("mes por defecto: el anterior", () => {
    expect(defaultReportMonth("2026-01-15")).toEqual({ year: 2025, month: 12 });
    expect(defaultReportMonth("2026-11-19")).toEqual({ year: 2026, month: 10 });
  });
});
