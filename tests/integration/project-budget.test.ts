import { addDays, type Ctx, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { createClient } from "@agencyos/modules/crm/service";
import { createAccount, createTransaction } from "@agencyos/modules/finance/service";
import { createProject } from "@agencyos/modules/projects/service";
import { createQuote } from "@agencyos/modules/quotes/service";
import { createTask } from "@agencyos/modules/tasks/service";
import { projectBudget } from "@agencyos/modules/time/queries";
import { createTimeEntry } from "@agencyos/modules/time/service";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

const withTarget = (ctx: Ctx, amount?: string) => ({
  ...ctx,
  workspace: { settings: amount ? { targetHourlyRate: amount, targetHourlyCurrency: "ARS" } : {} },
});

describe("presupuesto vs. real del proyecto", () => {
  it("horas que cubre el presupuesto a la tarifa objetivo, estimado, registrado, gastos y alerta", async () => {
    const ctx = await makeWorkspace();
    const c = await createClient(ctx, { name: "Cliente presupuesto" });
    const p = await createProject(ctx, { name: "Tienda", clientId: c.id });
    const today = todayAR();
    const q = await createQuote(ctx, {
      clientId: c.id,
      title: "Tienda online",
      currency: "ARS",
      issueDate: today,
      validUntil: addDays(today, 15),
      items: [{ description: "Desarrollo", quantity: "1", unitPrice: "400000" }],
    });
    await getDb().update(schema.project).set({ quoteId: q.id }).where(eq(schema.project.id, p.id));
    await createTask(ctx, { title: "Diseño", projectId: p.id, estimateMinutes: 600 });
    await createTask(ctx, { title: "Desarrollo", projectId: p.id, estimateMinutes: 1200 });
    await createTask(ctx, { title: "Sin estimar", projectId: p.id });
    for (let i = 0; i < 5; i++) await createTimeEntry(ctx, { projectId: p.id, duration: "9h" });
    const ledgerId = ctx.ledgers.find((l) => l.name === "Agencia")?.id as string;
    const acc = await createAccount(ctx, { name: "Caja", ledgerId, kind: "cash", currency: "ARS", openingBalance: "0" });
    await createTransaction(ctx, { kind: "expense", amount: "50000", accountId: acc.id, date: today, projectId: p.id });

    const b = await projectBudget(withTarget(ctx, "10000.00"), p.id);
    expect(b.quote).toMatchObject({ id: q.id, total: "400000.00", currency: "ARS" });
    expect(b.coveredMinutes).toBe(40 * 60);
    expect(b.estimateMinutes).toBe(1800);
    expect(b.unestimatedTasks).toBe(1);
    expect(b.loggedMinutes).toBe(45 * 60);
    expect(b.expenses).toEqual([{ currency: "ARS", total: "50000.00" }]);
    expect(b.realRate).toBe("7777.78"); // (400.000 − 50.000) / 45 h
    expect(b.over).toBe("budget");

    // sin tarifa objetivo: no hay horas cubiertas y compara contra lo estimado
    const b2 = await projectBudget(withTarget(ctx), p.id);
    expect(b2.coveredMinutes).toBeNull();
    expect(b2.over).toBe("estimate");

    // permisos: un colaborador no ve el presupuesto
    await expect(projectBudget({ ...ctx, role: "member" } as Ctx, p.id)).rejects.toThrow();
  });
});
