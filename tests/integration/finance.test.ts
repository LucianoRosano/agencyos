import { addDays, type Ctx, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { financeOverview, getAccountBalance, getReceipt, listAccounts, listCategories, listReceivables, listTransactions, monthlyReport, profitability, subscriptionMonthlyCost } from "@agencyos/modules/finance/queries";
import {
  advanceDue,
  createAccount,
  createCategory,
  createPayable,
  createReceivable,
  createSubscription,
  createTransaction,
  createTransfer,
  deleteTransaction,
  markOverdue,
  registerCollection,
  registerPayablePayment,
  registerSubscriptionPayment,
  trashCategory,
  undoSubscriptionPayment,
} from "@agencyos/modules/finance/service";
import { getToday } from "@agencyos/modules/today/queries";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agentCtx, makeWorkspace } from "./helpers";

type WS = Awaited<ReturnType<typeof makeWorkspace>>;
const agencia = (ws: WS) => ws.ledgers.find((l) => l.name === "Agencia")?.id as string;
const personal = (ws: WS) => ws.ledgers.find((l) => l.name === "Personal")?.id as string;

async function client(ctx: Ctx, name = "Cliente de prueba") {
  const [c] = await getDb().insert(schema.client).values({ workspaceId: ctx.workspaceId, name }).returning();
  return c as typeof schema.client.$inferSelect;
}

describe("finanzas", () => {
  it("todo arranca vacío: sin cuentas ni movimientos, con libros y categorías sembradas", async () => {
    const ws = await makeWorkspace();
    expect(await listAccounts(ws)).toEqual([]);
    expect((await listTransactions(ws)).items).toEqual([]);
    expect((await listCategories(ws)).length).toBeGreaterThan(5);
    const ov = await financeOverview(ws);
    expect(ov.accounts).toEqual([]);
    expect(ov.upcoming).toEqual([]);
  });

  it("saldo de cuenta = inicial + ingresos − gastos ± transferencias (en SQL)", async () => {
    const ws = await makeWorkspace();
    const caja = await createAccount(ws, {
      name: "Efectivo",
      ledgerId: agencia(ws),
      kind: "cash",
      currency: "ARS",
      openingBalance: "10.000,50",
      openingDate: "2026-01-01",
    });
    const mp = await createAccount(ws, {
      name: "Mercado Pago",
      ledgerId: personal(ws),
      kind: "wallet",
      currency: "ARS",
      openingBalance: "0",
    });
    await createTransaction(ws, {
      kind: "income",
      amount: "2500",
      accountId: caja.id,
      date: "2026-02-01",
    });
    await createTransaction(ws, {
      kind: "expense",
      amount: "499.99",
      accountId: caja.id,
      date: "2026-02-02",
    });
    const tr = await createTransfer(ws, {
      fromAccountId: caja.id,
      toAccountId: mp.id,
      amount: "1000.01",
      date: "2026-02-03",
    });
    expect(tr.rows).toHaveLength(2);
    expect(tr.rows.map((r) => r.kind).sort()).toEqual(["transfer_in", "transfer_out"]);
    expect(tr.rows.every((r) => r.transferPairId === tr.pair)).toBe(true);
    expect((await getAccountBalance(ws, caja.id))?.balance).toBe("11000.50");
    expect((await getAccountBalance(ws, mp.id))?.balance).toBe("1000.01");
    // Las transferencias no son ingreso ni gasto.
    const rep = await monthlyReport(ws, {
      from: "2026-02-01",
      to: "2026-02-28",
      currency: "ARS",
    });
    expect(rep.totals).toEqual({
      income: "2500.00",
      expense: "499.99",
      result: "2000.01",
    });
    // Eliminar la transferencia borra las dos filas.
    await deleteTransaction(ws, tr.rows[0]?.id as string);
    expect((await getAccountBalance(ws, caja.id))?.balance).toBe("12000.51");
    expect((await getAccountBalance(ws, mp.id))?.balance).toBe("0.00");
    // Filtro por libro.
    expect((await listAccounts(ws, { ledgerId: personal(ws) })).map((a) => a.id)).toEqual([mp.id]);
  });

  it("transferencia ARS → USD pide el monto acreditado y guarda la cotización implícita", async () => {
    const ws = await makeWorkspace();
    const ars = await createAccount(ws, {
      name: "Banco",
      ledgerId: agencia(ws),
      kind: "bank",
      currency: "ARS",
      openingBalance: "200000",
    });
    const usd = await createAccount(ws, {
      name: "Dólares",
      ledgerId: agencia(ws),
      kind: "usd",
      currency: "USD",
    });
    await expect(
      createTransfer(ws, {
        fromAccountId: ars.id,
        toAccountId: usd.id,
        amount: "145000",
      }),
    ).rejects.toThrow(/distinta moneda/);
    const tr = await createTransfer(ws, {
      fromAccountId: ars.id,
      toAccountId: usd.id,
      amount: "145000",
      toAmount: "100",
    });
    expect(tr.rows[0]?.exchangeRate).toBe("1450.0000");
    expect((await getAccountBalance(ws, usd.id))?.balance).toBe("100.00");
    await expect(
      createTransfer(ws, {
        fromAccountId: ars.id,
        toAccountId: ars.id,
        amount: "1",
      }),
    ).rejects.toThrow();
  });

  it("montos con centavos sin errores de redondeo", async () => {
    const ws = await makeWorkspace();
    const a = await createAccount(ws, {
      name: "Caja",
      ledgerId: agencia(ws),
      currency: "ARS",
      openingBalance: "0.10",
    });
    for (let i = 0; i < 10; i++)
      await createTransaction(ws, {
        kind: "income",
        amount: "0.10",
        accountId: a.id,
        date: "2026-03-01",
      });
    await createTransaction(ws, {
      kind: "expense",
      amount: "0,20",
      accountId: a.id,
      date: "2026-03-01",
    });
    await createTransaction(ws, {
      kind: "income",
      amount: "1.234,56",
      accountId: a.id,
      date: "2026-03-02",
    });
    expect((await getAccountBalance(ws, a.id))?.balance).toBe("1235.46");
    await expect(createTransaction(ws, { kind: "income", amount: "0", accountId: a.id })).rejects.toThrow();
    await expect(
      createTransaction(ws, {
        kind: "income",
        amount: "1.234",
        accountId: a.id,
      }),
    ).rejects.toThrow(); // ambiguo: 3 decimales
  });

  it("valida la categoría según el tipo y permite jerarquía de dos niveles", async () => {
    const ws = await makeWorkspace();
    const a = await createAccount(ws, {
      name: "Caja",
      ledgerId: agencia(ws),
      currency: "ARS",
    });
    const cats = await listCategories(ws);
    const income = cats.find((c) => c.kind === "income");
    await expect(
      createTransaction(ws, {
        kind: "expense",
        amount: "10",
        accountId: a.id,
        categoryId: income?.id,
      }),
    ).rejects.toThrow(/categoría/);
    const expense = cats.find((c) => c.kind === "expense" && c.name === "Herramientas / SaaS");
    const child = await createCategory(ws, {
      name: "Diseño",
      kind: "expense",
      parentId: expense?.id,
    });
    await expect(
      createCategory(ws, {
        name: "Nieta",
        kind: "expense",
        parentId: child.id,
      }),
    ).rejects.toThrow(/dos niveles/);
    expect((await listCategories(ws)).find((c) => c.id === child.id)?.label).toBe("Herramientas / SaaS › Diseño");
    await createTransaction(ws, {
      kind: "expense",
      amount: "10",
      accountId: a.id,
      categoryId: child.id,
    });
    expect((await listTransactions(ws, { categoryId: expense?.id })).items).toHaveLength(1);
    await trashCategory(ws, expense?.id as string);
    expect((await listCategories(ws)).find((c) => c.id === child.id)).toBeUndefined();
  });

  it("lista con filtros y paginación por cursor", async () => {
    const ws = await makeWorkspace();
    const a = await createAccount(ws, {
      name: "Caja",
      ledgerId: agencia(ws),
      currency: "ARS",
    });
    for (let i = 1; i <= 7; i++)
      await createTransaction(ws, {
        kind: i % 2 ? "income" : "expense",
        amount: `${i}`,
        accountId: a.id,
        date: `2026-04-0${i}`,
        description: `Mov ${i}`,
      });
    const p1 = await listTransactions(ws, { limit: 3 });
    expect(p1.items.map((x) => x.description)).toEqual(["Mov 7", "Mov 6", "Mov 5"]);
    const p2 = await listTransactions(ws, {
      limit: 3,
      cursor: p1.nextCursor ?? undefined,
    });
    expect(p2.items.map((x) => x.description)).toEqual(["Mov 4", "Mov 3", "Mov 2"]);
    const p3 = await listTransactions(ws, {
      limit: 3,
      cursor: p2.nextCursor ?? undefined,
    });
    expect(p3.items.map((x) => x.description)).toEqual(["Mov 1"]);
    expect(p3.nextCursor).toBeNull();
    expect((await listTransactions(ws, { kind: "expense" })).items).toHaveLength(3);
    expect((await listTransactions(ws, { from: "2026-04-03", to: "2026-04-04" })).items).toHaveLength(2);
    expect((await listTransactions(ws, { q: "mov 5" })).items).toHaveLength(1);
  });

  it("registrar pago de suscripción crea el gasto y avanza la fecha (mensual a fin de mes) con deshacer", async () => {
    const ws = await makeWorkspace();
    const a = await createAccount(ws, {
      name: "Tarjeta USD",
      ledgerId: agencia(ws),
      currency: "USD",
      kind: "usd",
    });
    const s = await createSubscription(ws, {
      ledgerId: agencia(ws),
      vendor: "Claude Pro",
      amount: "20",
      currency: "USD",
      frequency: "monthly",
      nextDue: "2027-01-31",
      accountId: a.id,
    });
    const r = await registerSubscriptionPayment(ws, s.id, {
      amount: "20",
      accountId: a.id,
      date: "2027-01-31",
    });
    expect(r.nextDue).toBe("2027-02-28");
    expect(r.transaction.subscriptionId).toBe(s.id);
    expect(r.transaction.kind).toBe("expense");
    expect(r.transaction.counterpart).toBe("Claude Pro");
    expect((await getAccountBalance(ws, a.id))?.balance).toBe("-20.00");
    await undoSubscriptionPayment(ws, s.id, r.transaction.id, r.previousDue);
    const [back] = await getDb().select().from(schema.subscription).where(eq(schema.subscription.id, s.id));
    expect(back?.nextDue).toBe("2027-01-31");
    expect((await getAccountBalance(ws, a.id))?.balance).toBe("0.00");
    // Moneda de la cuenta distinta a la de la suscripción.
    const ars = await createAccount(ws, {
      name: "Caja",
      ledgerId: agencia(ws),
      currency: "ARS",
    });
    await expect(
      registerSubscriptionPayment(ws, s.id, {
        amount: "20",
        accountId: ars.id,
      }),
    ).rejects.toThrow(/USD/);
    expect(advanceDue("2026-12-29", "weekly", 2)).toBe("2027-01-12");
    expect(advanceDue("2028-02-29", "yearly", 1)).toBe("2029-02-28");
  });

  it("costo mensual de herramientas normalizado y por moneda", async () => {
    const ws = await makeWorkspace();
    await createSubscription(ws, {
      ledgerId: agencia(ws),
      vendor: "Claude",
      amount: "20",
      currency: "USD",
      frequency: "monthly",
      nextDue: "2030-01-01",
    });
    await createSubscription(ws, {
      ledgerId: agencia(ws),
      vendor: "Dominio",
      amount: "12000",
      currency: "ARS",
      frequency: "yearly",
      nextDue: "2030-01-01",
    });
    await createSubscription(ws, {
      ledgerId: agencia(ws),
      vendor: "Hosting",
      amount: "30",
      currency: "USD",
      frequency: "monthly",
      intervalCount: 3,
      nextDue: "2030-01-01",
    });
    await createSubscription(ws, {
      ledgerId: personal(ws),
      vendor: "Pausada",
      amount: "99",
      currency: "USD",
      frequency: "monthly",
      nextDue: "2030-01-01",
      status: "paused",
    });
    const cost = await subscriptionMonthlyCost(ws);
    expect(cost.byCurrency).toEqual([
      { currency: "ARS", total: "1000.00" },
      { currency: "USD", total: "30.00" },
    ]);
    expect(cost.count).toBe(3);
  });

  it("una suscripción que vence en 3 días aparece en «Ponerse al día» de Hoy", async () => {
    const ws = await makeWorkspace();
    const s = await createSubscription(ws, {
      ledgerId: agencia(ws),
      vendor: "Hostinger",
      amount: "15000",
      currency: "ARS",
      nextDue: addDays(todayAR(), 3),
      notifyDaysBefore: 3,
    });
    const today = await getToday(ws, { userId: ws.userId as string });
    const item = today.catchUp.find((i) => i.entityId === s.id);
    expect(item?.title).toBe("Renovar Hostinger");
    expect(item?.href).toBe(`/finanzas/suscripciones?pagar=${s.id}`);
    expect((await financeOverview(ws)).upcoming.some((u) => u.title === "Renovar Hostinger")).toBe(true);
  });

  it("cobro parcial → partial, total → paid, con constancia numerada", async () => {
    const ws = await makeWorkspace();
    const c = await client(ws, "Librería Uno");
    const a = await createAccount(ws, {
      name: "Banco",
      ledgerId: agencia(ws),
      currency: "ARS",
      kind: "bank",
    });
    await expect(createReceivable(ws, { concept: "Sin cliente", amount: "10" })).rejects.toThrow();
    const r = await createReceivable(ws, {
      clientId: c.id,
      concept: "Sitio web · anticipo",
      amount: "100000.10",
      currency: "ARS",
      dueDate: addDays(todayAR(), 10),
    });
    expect(r.status).toBe("pending");
    const p1 = await registerCollection(ws, r.id, {
      amount: "40000.05",
      accountId: a.id,
    });
    expect(p1.receivable?.status).toBe("partial");
    expect(p1.receivable?.paidAmount).toBe("40000.05");
    expect(p1.number).toMatch(/^C-\d{4}-0001$/);
    expect(p1.transaction.clientId).toBe(c.id);
    await expect(registerCollection(ws, r.id, { amount: "60000.06", accountId: a.id })).rejects.toThrow(/supera/);
    const p2 = await registerCollection(ws, r.id, {
      amount: "60000.05",
      accountId: a.id,
    });
    expect(p2.receivable?.status).toBe("paid");
    expect(p2.receivable?.paidAmount).toBe("100000.10");
    expect(p2.number).toMatch(/-0002$/);
    const receipt = await getReceipt(ws, p2.transaction.id);
    expect(receipt?.number).toBe(p2.number);
    expect(receipt?.client?.name).toBe("Librería Uno");
    // Deshacer el último cobro vuelve a parcial.
    await deleteTransaction(ws, p2.transaction.id);
    const [again] = await listReceivables(ws, { view: "abiertos" });
    expect(again?.r.status).toBe("partial");
    expect(again?.payments).toHaveLength(1);
    // Cuenta en otra moneda.
    const usd = await createAccount(ws, {
      name: "USD",
      ledgerId: agencia(ws),
      currency: "USD",
    });
    await expect(registerCollection(ws, r.id, { amount: "1", accountId: usd.id })).rejects.toThrow(/ARS/);
    const prof = await profitability(ws, {
      from: "2000-01-01",
      to: "2100-01-01",
      currency: "ARS",
    });
    expect(prof.clients[0]).toMatchObject({
      name: "Librería Uno",
      income: "40000.05",
      result: "40000.05",
    });
  });

  it("registrar pago de una deuda (parcial y total)", async () => {
    const ws = await makeWorkspace();
    const a = await createAccount(ws, {
      name: "Caja",
      ledgerId: personal(ws),
      currency: "ARS",
    });
    const p = await createPayable(ws, {
      ledgerId: personal(ws),
      counterpart: "Juan",
      concept: "Préstamo",
      amount: "300",
      currency: "ARS",
      dueDate: addDays(todayAR(), 5),
    });
    const r1 = await registerPayablePayment(ws, p.id, {
      amount: "100",
      accountId: a.id,
    });
    expect(r1.payable?.status).toBe("partial");
    expect(r1.transaction.payableId).toBe(p.id);
    const r2 = await registerPayablePayment(ws, p.id, {
      amount: "200",
      accountId: a.id,
    });
    expect(r2.payable?.status).toBe("paid");
    expect((await getAccountBalance(ws, a.id))?.balance).toBe("-300.00");
  });

  it("markOverdue pasa a vencido los pendientes y emite eventos", async () => {
    const ws = await makeWorkspace();
    const c = await client(ws);
    const today = todayAR();
    const r = await createReceivable(ws, {
      clientId: c.id,
      concept: "Vencido",
      amount: "10",
      dueDate: addDays(today, 2),
    });
    const ok = await createReceivable(ws, {
      clientId: c.id,
      concept: "Al día",
      amount: "10",
      dueDate: addDays(today, 30),
    });
    const p = await createPayable(ws, {
      ledgerId: agencia(ws),
      counterpart: "Proveedor",
      concept: "Factura",
      amount: "5",
      dueDate: addDays(today, 1),
    });
    const res = await markOverdue(addDays(today, 3));
    expect(res.receivables).toBeGreaterThanOrEqual(1);
    expect(res.payables).toBeGreaterThanOrEqual(1);
    const rows = await getDb().select().from(schema.receivable).where(eq(schema.receivable.workspaceId, ws.workspaceId));
    expect(rows.find((x) => x.id === r.id)?.status).toBe("overdue");
    expect(rows.find((x) => x.id === ok.id)?.status).toBe("pending");
    const [pp] = await getDb().select().from(schema.payable).where(eq(schema.payable.id, p.id));
    expect(pp?.status).toBe("overdue");
    const events = await getDb()
      .select()
      .from(schema.domainEvent)
      .where(and(eq(schema.domainEvent.workspaceId, ws.workspaceId)));
    expect(events.some((e) => e.type === "cobro.vencido" && e.entityId === r.id)).toBe(true);
    expect(events.some((e) => e.type === "pago.vencido" && e.entityId === p.id)).toBe(true);
    // Idempotente: no vuelve a emitir.
    await markOverdue(addDays(today, 3));
    const evAfter = await getDb()
      .select()
      .from(schema.domainEvent)
      .where(and(eq(schema.domainEvent.workspaceId, ws.workspaceId), eq(schema.domainEvent.type, "cobro.vencido")));
    expect(evAfter).toHaveLength(1);
  });

  it("eventos con resumen en español", async () => {
    const ws = await makeWorkspace();
    const a = await createAccount(ws, {
      name: "Caja",
      ledgerId: agencia(ws),
      currency: "ARS",
    });
    await createTransaction(ws, {
      kind: "expense",
      amount: "1500",
      accountId: a.id,
      description: "Teclado",
    });
    const [act] = await getDb()
      .select()
      .from(schema.activity)
      .where(and(eq(schema.activity.workspaceId, ws.workspaceId), eq(schema.activity.verb, "movimiento.registrado")));
    expect(act?.summary).toContain("gasto de $ 1.500");
  });

  it("reportes: movimientos en otra moneda sin cotización se muestran aparte", async () => {
    const ws = await makeWorkspace();
    const ars = await createAccount(ws, {
      name: "Caja",
      ledgerId: agencia(ws),
      currency: "ARS",
    });
    const usd = await createAccount(ws, {
      name: "USD",
      ledgerId: agencia(ws),
      currency: "USD",
    });
    await createTransaction(ws, {
      kind: "income",
      amount: "1000",
      accountId: ars.id,
      date: "2026-05-10",
    });
    await createTransaction(ws, {
      kind: "income",
      amount: "10",
      accountId: usd.id,
      date: "2026-05-11",
      exchangeRate: "1.200,50",
    });
    await createTransaction(ws, {
      kind: "expense",
      amount: "5",
      accountId: usd.id,
      date: "2026-05-12",
    });
    const rep = await monthlyReport(ws, {
      from: "2026-05-01",
      to: "2026-05-31",
      currency: "ARS",
    });
    expect(rep.totals.income).toBe("13005.00");
    expect(rep.totals.expense).toBe("0.00");
    expect(rep.unconverted).toEqual([{ currency: "USD", kind: "expense", total: "5.00", n: 1 }]);
    const repUsd = await monthlyReport(ws, {
      from: "2026-05-01",
      to: "2026-05-31",
      currency: "USD",
    });
    expect(repUsd.totals).toEqual({
      income: "10.00",
      expense: "5.00",
      result: "5.00",
    });
    expect(repUsd.unconverted).toEqual([{ currency: "ARS", kind: "income", total: "1000.00", n: 1 }]);
  });

  it("aislamiento multi-inquilino: A no ve ni toca datos de B", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const accB = await createAccount(b, {
      name: "Secreta de B",
      ledgerId: agencia(b),
      currency: "ARS",
      openingBalance: "999",
    });
    const txB = await createTransaction(b, {
      kind: "income",
      amount: "1",
      accountId: accB.id,
    });
    const subB = await createSubscription(b, {
      ledgerId: agencia(b),
      vendor: "B tool",
      amount: "1",
      currency: "ARS",
      nextDue: "2030-01-01",
    });
    expect(await listAccounts(a)).toEqual([]);
    expect((await listTransactions(a)).items).toEqual([]);
    // A no puede usar cuentas ni libros de B.
    await expect(createTransaction(a, { kind: "income", amount: "1", accountId: accB.id })).rejects.toThrow(/cuenta/);
    await expect(createAccount(a, { name: "x", ledgerId: agencia(b), currency: "ARS" })).rejects.toThrow(/libro/);
    await expect(deleteTransaction(a, txB.id)).rejects.toThrow();
    await expect(
      registerSubscriptionPayment(a, subB.id, {
        amount: "1",
        accountId: accB.id,
      }),
    ).rejects.toThrow();
    expect(await getReceipt(a, txB.id)).toBeNull();
  });

  it("permisos: un member no accede a finanzas; un token MCP sin alcance no escribe", async () => {
    const ws = await makeWorkspace();
    const member: Ctx = { ...ws, role: "member" };
    await expect(listAccounts(member)).rejects.toThrow(/permiso/);
    await expect(financeOverview(member)).rejects.toThrow(/permiso/);
    await expect(
      createAccount(member, {
        name: "x",
        ledgerId: agencia(ws),
        currency: "ARS",
      }),
    ).rejects.toThrow(/permiso/);
    const bot = agentCtx(ws, ["read:all"]);
    await expect(createAccount(bot, { name: "x", ledgerId: agencia(ws), currency: "ARS" })).rejects.toThrow(/alcance/);
    expect(await listAccounts(bot)).toEqual([]);
  });

  it("acepta formularios con campos opcionales vacíos (FormData)", async () => {
    const ws = await makeWorkspace();
    const a = await createAccount(ws, { name: "Caja", ledgerId: agencia(ws), kind: "cash", currency: "ARS", openingBalance: "", openingDate: "" });
    expect(a.openingBalance).toBe("0.00");
    const t = await createTransaction(ws, { kind: "expense", amount: "10", date: "", accountId: a.id, categoryId: "", clientId: "", projectId: "", counterpart: "", description: "", exchangeRate: "" });
    expect(t.description).toBeNull();
    const s = await createSubscription(ws, { ledgerId: agencia(ws), vendor: "X", description: "", amount: "1", currency: "ARS", frequency: "monthly", intervalCount: "1", nextDue: "2030-01-01", accountId: "", categoryId: "", notifyDaysBefore: "3", status: "active" });
    expect(s.accountId).toBeNull();
    await expect(createTransfer(ws, { fromAccountId: a.id, toAccountId: "", amount: "1", toAmount: "", description: "", date: "" })).rejects.toThrow();
  });
});
