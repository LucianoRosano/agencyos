import { getDb, schema } from "@agencyos/db";
import { addFiscalReminders, completeReminder, createReminder, listReminders, nextDateOn } from "@agencyos/modules/today/service";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

const open = async (ws: { workspaceId: string }) =>
  getDb()
    .select()
    .from(schema.reminder)
    .where(and(eq(schema.reminder.workspaceId, ws.workspaceId), isNull(schema.reminder.doneAt)));

describe("vencimientos periódicos y fiscales", () => {
  it("nextDateOn: próxima fecha en el día y meses pedidos", () => {
    expect(nextDateOn(20, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "2026-11-21")).toBe("2026-12-20");
    expect(nextDateOn(20, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "2026-11-20")).toBe("2026-11-20");
    expect(nextDateOn(5, [2, 8], "2026-11-21")).toBe("2027-02-05");
    expect(nextDateOn(5, [2, 8], "2026-02-06")).toBe("2026-08-05");
  });

  it("mensual, semestral y anual (compatibilidad con «recurring»): al completar se agenda el siguiente", async () => {
    const ws = await makeWorkspace();
    const m = await createReminder(ws, { title: "Mensual", dueDate: "2026-01-31", recurMonths: "1" });
    expect(m).toMatchObject({ recurMonths: 1, recurring: false });
    await completeReminder(ws, m.id);
    const s = await createReminder(ws, { title: "Semestral", dueDate: "2026-02-05", recurMonths: "6" });
    await completeReminder(ws, s.id);
    const a = await createReminder(ws, { title: "Anual viejo", dueDate: "2026-03-10", recurring: "on" });
    expect(a).toMatchObject({ recurMonths: 12, recurring: true });
    await completeReminder(ws, a.id);
    const once = await createReminder(ws, { title: "Una vez", dueDate: "2026-03-10", recurMonths: "" });
    await completeReminder(ws, once.id);
    const dates = Object.fromEntries((await open(ws)).map((r) => [r.title, r.dueDate]));
    expect(dates).toEqual({ Mensual: "2026-02-28", Semestral: "2026-08-05", "Anual viejo": "2027-03-10" });
    await expect(createReminder(ws, { title: "X", dueDate: "2026-03-10", recurMonths: "5" })).rejects.toThrow();
  });

  it("vencimientos fiscales: agenda los elegidos, no duplica los pendientes y valida", async () => {
    const ws = await makeWorkspace();
    const r = await addFiscalReminders(ws, { monotributo: "on", recategorizacion: "on", certificado: "2028-10-27" });
    expect(r.created).toHaveLength(3);
    const rows = await listReminders(ws);
    const mono = rows.find((x) => x.title.includes("Pagar el monotributo"));
    expect(mono?.recurMonths).toBe(1);
    expect(mono?.dueDate.endsWith("-20")).toBe(true);
    expect(rows.find((x) => x.title.includes("Recategorización"))?.recurMonths).toBe(6);
    expect(rows.find((x) => x.title.includes("certificado"))).toMatchObject({ dueDate: "2028-10-27", kind: "certificate", recurMonths: null });
    const again = await addFiscalReminders(ws, { monotributo: "on", recategorizacion: "on" });
    expect(again).toEqual({ created: [], skipped: 2 });
    await expect(addFiscalReminders(ws, {})).rejects.toThrow(/al menos/);
    // Otro workspace no se ve afectado
    const other = await makeWorkspace();
    expect((await addFiscalReminders(other, { monotributo: "on" })).created).toHaveLength(1);
  });
});
