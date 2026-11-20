import { todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { createClient } from "@agencyos/modules/crm/service";
import { createProject } from "@agencyos/modules/projects/service";
import {
  createRetainer,
  issueDueRetainers,
  listRetainers,
  nextIssueOn,
  retainerMrr,
  setRetainerStatus,
  updateRetainer,
} from "@agencyos/modules/retainers/service";
import { createTimeEntry } from "@agencyos/modules/time/service";
import { moveToTrash } from "@agencyos/modules/trash/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

const receivablesOf = (ws: string) => getDb().select().from(schema.receivable).where(eq(schema.receivable.workspaceId, ws));

describe("abonos mensuales", () => {
  it("nextIssueOn: este mes si todavía no pasó el día, si no el siguiente", () => {
    expect(nextIssueOn("2026-11-05", 10)).toBe("2026-11-10");
    expect(nextIssueOn("2026-11-10", 10)).toBe("2026-11-10");
    expect(nextIssueOn("2026-11-11", 10)).toBe("2026-12-10");
    expect(nextIssueOn("2026-12-20", 1)).toBe("2027-01-01");
  });

  it("genera un cobro por mes, idempotente, y se pone al día como mucho 3 meses", async () => {
    const ws = await makeWorkspace();
    const c = await createClient(ws, { name: "Panadería Sol" });
    const r = await createRetainer(ws, {
      clientId: c.id,
      concept: "Mantenimiento web",
      amount: "45.000",
      currency: "ARS",
      billingDay: 5,
      dueDays: 10,
      startDate: "2026-08-01",
    });
    expect(r.nextIssueDate).toBe("2026-08-05");
    await issueDueRetainers("2026-08-04");
    expect(await receivablesOf(ws.workspaceId)).toHaveLength(0);
    await issueDueRetainers("2026-08-05");
    await issueDueRetainers("2026-08-05"); // segunda corrida el mismo día: no duplica
    let recs = await receivablesOf(ws.workspaceId);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ concept: "Abono agosto 2026 · Mantenimiento web", amount: "45000.00", dueDate: "2026-08-15", clientId: c.id });
    // worker caído hasta noviembre: se ponen al día sep, oct, nov
    await issueDueRetainers("2026-11-20");
    recs = await receivablesOf(ws.workspaceId);
    expect(recs.map((x) => x.concept).sort()).toEqual([
      "Abono agosto 2026 · Mantenimiento web",
      "Abono noviembre 2026 · Mantenimiento web",
      "Abono octubre 2026 · Mantenimiento web",
      "Abono septiembre 2026 · Mantenimiento web",
    ]);
    const [row] = await getDb().select().from(schema.retainer).where(eq(schema.retainer.id, r.id));
    expect(row?.nextIssueDate).toBe("2026-12-05");
  });

  it("pausa, reanudación sin cobrar lo pausado, fin del abono y papelera", async () => {
    const ws = await makeWorkspace();
    const c = await createClient(ws, { name: "Librería Uno" });
    const r = await createRetainer(ws, {
      clientId: c.id,
      concept: "SEO mensual",
      amount: "100",
      currency: "USD",
      billingDay: 1,
      startDate: "2026-01-01",
      endDate: "2026-02-15",
    });
    await setRetainerStatus(ws, r.id, "paused");
    await issueDueRetainers("2026-01-10");
    expect(await receivablesOf(ws.workspaceId)).toHaveLength(0);
    await setRetainerStatus(ws, r.id, "active");
    await issueDueRetainers("2026-03-10");
    // con fin 15/02: no emite marzo y queda dado de baja
    const recs = await receivablesOf(ws.workspaceId);
    expect(recs.every((x) => x.concept < "Abono marzo")).toBe(true);
    const r2 = await createRetainer(ws, { clientId: c.id, concept: "Hosting", amount: "10", currency: "USD", billingDay: 1 });
    await moveToTrash(ws, "retainer", r2.id);
    expect((await listRetainers(ws)).map((x) => x.r.concept)).not.toContain("Hosting");
  });

  it("MRR por moneda y horas usadas vs incluidas del mes", async () => {
    const ws = await makeWorkspace();
    const c = await createClient(ws, { name: "Estudio Nora" });
    const p = await createProject(ws, { name: "Web Nora", clientId: c.id });
    await createRetainer(ws, { clientId: c.id, projectId: p.id, concept: "Mantenimiento", amount: "30000", currency: "ARS", hoursIncluded: "5" });
    await createRetainer(ws, { clientId: c.id, concept: "Ads", amount: "200", currency: "USD" });
    const paused = await createRetainer(ws, { clientId: c.id, concept: "Pausado", amount: "999", currency: "ARS" });
    await setRetainerStatus(ws, paused.id, "paused");
    const mrr = await retainerMrr(ws);
    expect(mrr.byCurrency.sort((a, b) => a.currency.localeCompare(b.currency))).toEqual([
      { currency: "ARS", total: "30000.00" },
      { currency: "USD", total: "200.00" },
    ]);
    await createTimeEntry(ws, { projectId: p.id, duration: "1h30", date: todayAR() });
    const list = await listRetainers(ws, { clientId: c.id });
    expect(list.find((x) => x.r.concept === "Mantenimiento")?.minutesUsed).toBe(90);
    expect(list.find((x) => x.r.concept === "Ads")?.minutesUsed).toBeNull();
  });

  it("aislamiento, validaciones y permisos", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const ca = await createClient(a, { name: "Cliente A" });
    const cb = await createClient(b, { name: "Cliente B" });
    await expect(createRetainer(b, { clientId: ca.id, concept: "X", amount: "1" })).rejects.toThrow();
    const pb = await createProject(b, { name: "Otro", clientId: cb.id });
    await expect(createRetainer(a, { clientId: ca.id, projectId: pb.id, concept: "X", amount: "1" })).rejects.toThrow();
    await expect(createRetainer(a, { clientId: ca.id, concept: "X", amount: "0" })).rejects.toThrow();
    await expect(createRetainer(a, { clientId: ca.id, concept: "X", amount: "1", billingDay: 31 })).rejects.toThrow();
    const r = await createRetainer(a, { clientId: ca.id, concept: "X", amount: "1" });
    await expect(updateRetainer(b, r.id, { clientId: cb.id, concept: "Y", amount: "1" })).rejects.toThrow();
    await expect(listRetainers({ ...a, role: "member" })).rejects.toThrow();
    const rows = await getDb()
      .select()
      .from(schema.retainer)
      .where(and(eq(schema.retainer.workspaceId, b.workspaceId)));
    expect(rows).toHaveLength(0);
  });
});
