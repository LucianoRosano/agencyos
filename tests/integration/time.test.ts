import { type Ctx, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { createClient } from "@agencyos/modules/crm/service";
import { createAccount, createTransaction } from "@agencyos/modules/finance/service";
import { createProject } from "@agencyos/modules/projects/service";
import { createTask } from "@agencyos/modules/tasks/service";
import { listTimeEntries, minutesByClient, projectProfitability, timeSummary } from "@agencyos/modules/time/queries";
import { createTimeEntry, setTargetHourlyRate, updateTimeEntry } from "@agencyos/modules/time/service";
import { logFocusSession } from "@agencyos/modules/today/service";
import { moveToTrash, restoreFromTrash } from "@agencyos/modules/trash/service";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

const member = (c: Ctx): Ctx => ({ ...c, role: "member" });

describe("registro de horas", () => {
  it("registra horas a mano con «1h30», edita y manda a la papelera con restaurar", async () => {
    const ctx = await makeWorkspace();
    const p = await createProject(ctx, { name: "Web de prueba" });
    const e = await createTimeEntry(ctx, { projectId: p.id, duration: "1h30", billable: "on", note: "Maquetado" });
    expect(e.minutes).toBe(90);
    expect(e.date).toBe(todayAR());
    expect(e.billable).toBe(true);
    const up = await updateTimeEntry(ctx, e.id, { projectId: p.id, duration: "2:00", billable: "", date: "2026-01-05" });
    expect(up.minutes).toBe(120);
    expect(up.billable).toBe(false);
    let s = await timeSummary(ctx, { projectId: p.id });
    expect(s.minutes).toBe(120);
    expect(s.billableMinutes).toBe(0);
    expect(s.weeks[0]?.week).toBe("2026-01-05");
    await moveToTrash(ctx, "time_entry", e.id);
    s = await timeSummary(ctx, { projectId: p.id });
    expect(s.minutes).toBe(0);
    await restoreFromTrash(ctx, "time_entry", e.id);
    expect((await listTimeEntries(ctx, { projectId: p.id })).length).toBe(1);
  });

  it("valida duración, destino y fecha", async () => {
    const ctx = await makeWorkspace();
    const p = await createProject(ctx, { name: "X" });
    await expect(createTimeEntry(ctx, { projectId: p.id, duration: "un rato" })).rejects.toThrow(/duración/);
    await expect(createTimeEntry(ctx, { duration: "30" })).rejects.toThrow(/proyecto o una tarea/);
    await expect(createTimeEntry(ctx, { projectId: p.id, duration: "25h" })).rejects.toThrow(/24 h/);
    await expect(createTimeEntry(ctx, { projectId: p.id, duration: "30", date: "2999-01-01" })).rejects.toThrow(/futuro/);
  });

  it("la tarea manda su proyecto y no se mezcla con otro proyecto", async () => {
    const ctx = await makeWorkspace();
    const p1 = await createProject(ctx, { name: "P1" });
    const p2 = await createProject(ctx, { name: "P2" });
    const t = await createTask(ctx, { title: "Diseño", projectId: p1.id });
    const e = await createTimeEntry(ctx, { taskId: t.id, duration: "45" });
    expect(e.projectId).toBe(p1.id);
    await expect(createTimeEntry(ctx, { taskId: t.id, projectId: p2.id, duration: "45" })).rejects.toThrow(/otro proyecto/);
    expect((await timeSummary(ctx, { taskId: t.id })).minutes).toBe(45);
  });

  it("el Modo foco sobre una tarea crea el registro (y mantiene la sesión de foco)", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Cliente foco" });
    const p = await createProject(ctx, { name: "Con cliente", clientId: c.id });
    const t = await createTask(ctx, { title: "Foco", projectId: p.id });
    await logFocusSession(ctx, { taskId: t.id, startedAt: new Date().toISOString(), minutes: 25 });
    const entries = await listTimeEntries(ctx, { taskId: t.id });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.e).toMatchObject({ minutes: 25, projectId: p.id, billable: true, note: "Sesión de foco" });
    const sessions = await getDb().select().from(schema.focusSession).where(eq(schema.focusSession.taskId, t.id));
    expect(sessions).toHaveLength(1);
    // sin tarea: no hay registro de horas
    await logFocusSession(ctx, { startedAt: new Date().toISOString(), minutes: 10 });
    expect((await getDb().select().from(schema.timeEntry).where(eq(schema.timeEntry.workspaceId, ctx.workspaceId))).length).toBe(1);
  });

  it("rentabilidad: tarifa efectiva por moneda con dinero exacto y horas por cliente", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Rentable" });
    const p = await createProject(ctx, { name: "Tienda", clientId: c.id });
    await createTimeEntry(ctx, { projectId: p.id, duration: "6h", billable: "on", date: "2026-02-10" });
    await createTimeEntry(ctx, { projectId: p.id, duration: "3h", billable: "on", date: "2026-02-11" });
    const ledgerId = ctx.ledgers.find((l) => l.name === "Agencia")?.id as string;
    const ars = await createAccount(ctx, { name: "Banco", ledgerId, kind: "bank", currency: "ARS", openingBalance: "0" });
    const usd = await createAccount(ctx, { name: "Dólares", ledgerId, kind: "usd", currency: "USD", openingBalance: "0" });
    await createTransaction(ctx, { kind: "income", amount: "100000", accountId: ars.id, date: "2026-02-15", projectId: p.id, clientId: c.id });
    await createTransaction(ctx, { kind: "income", amount: "100", accountId: usd.id, date: "2026-02-15", projectId: p.id, clientId: c.id });
    const r = await projectProfitability(ctx, p.id);
    expect(r.minutes).toBe(540);
    expect(r.rates).toEqual([
      { currency: "ARS", income: "100000.00", rate: "11111.11" },
      { currency: "USD", income: "100.00", rate: "11.11" },
    ]);
    const byClient = await minutesByClient(ctx, [c.id], "2026-02-01", "2026-02-28");
    expect(byClient.get(c.id)).toBe(540);
    expect((await minutesByClient(ctx, [c.id], "2026-03-01", "2026-03-31")).get(c.id)).toBeUndefined();
  });

  it("tarifa objetivo en la configuración (solo administración)", async () => {
    const ctx = await makeWorkspace();
    const r = await setTargetHourlyRate(ctx, { targetHourlyRate: "25.000", targetHourlyCurrency: "ARS" });
    expect(r.targetHourlyRate).toBe("25000.00");
    const [ws] = await getDb().select().from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId));
    expect((ws?.settings as Record<string, unknown> | undefined)?.targetHourlyRate).toBe("25000.00");
    await expect(setTargetHourlyRate(member(ctx), { targetHourlyRate: "1" })).rejects.toThrow();
    await setTargetHourlyRate(ctx, { targetHourlyRate: "" });
    const [ws2] = await getDb().select().from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId));
    expect((ws2?.settings as Record<string, unknown> | undefined)?.targetHourlyRate).toBeUndefined();
  });

  it("aislamiento A/B y permisos", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const pb = await createProject(b, { name: "De B" });
    const tb = await createTask(b, { title: "Tarea de B" });
    await expect(createTimeEntry(a, { projectId: pb.id, duration: "30" })).rejects.toThrow(/no existe/);
    await expect(createTimeEntry(a, { taskId: tb.id, duration: "30" })).rejects.toThrow(/no existe/);
    const eb = await createTimeEntry(b, { projectId: pb.id, duration: "30" });
    await expect(updateTimeEntry(a, eb.id, { projectId: pb.id, duration: "60" })).rejects.toThrow();
    await expect(moveToTrash(a, "time_entry", eb.id)).rejects.toThrow();
    expect((await timeSummary(a, { projectId: pb.id })).minutes).toBe(0);
    // un colaborador registra horas; un token MCP de solo lectura no
    const pa = await createProject(a, { name: "De A" });
    const pa2 = await createProject(a, { name: "De A sin asignar" });
    await getDb()
      .insert(schema.projectMember)
      .values({ workspaceId: a.workspaceId, projectId: pa.id, userId: a.userId ?? "" });
    await expect(createTimeEntry(member(a), { projectId: pa2.id, duration: "15" })).rejects.toThrow();
    expect((await createTimeEntry(member(a), { projectId: pa.id, duration: "15", rate: "1000" })).rate).toBeNull();
    await expect(createTimeEntry(member(a), { projectId: pa.id, duration: "15" })).resolves.toBeDefined();
    await expect(createTimeEntry(agentCtx(a, ["read:all"]), { projectId: pa.id, duration: "15" })).rejects.toThrow();
  });
});
