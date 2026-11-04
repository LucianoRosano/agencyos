import { calcLine, calcQuote, diffVersions, discountAmount, paymentSchedule, planIssues } from "@agencyos/modules/quotes/calc";
import { describe, expect, it } from "vitest";

const item = (quantity: string, unitPrice: string, discountType = "none", discountValue = "0") => ({ quantity, unitPrice, discountType, discountValue });

describe("presupuestos · cálculo de ítems", () => {
  it("cantidad × precio sin descuento", () => {
    expect(calcLine(item("3", "1000"))).toEqual({ gross: "3000.00", discount: "0.00", lineTotal: "3000.00" });
  });
  it("cantidades decimales redondean al centavo", () => {
    expect(calcLine(item("1.5", "33.33")).gross).toBe("50.00"); // 49.995 → 50.00 (half-up)
    expect(calcLine(item("0.33", "10")).gross).toBe("3.30");
  });
  it("descuento por ítem en %", () => {
    expect(calcLine(item("2", "1000", "percent", "10"))).toEqual({ gross: "2000.00", discount: "200.00", lineTotal: "1800.00" });
  });
  it("descuento por ítem en % con decimales y redondeo half-up", () => {
    // 12,5 % de 99,99 = 12,49875 → 12,50
    expect(calcLine(item("1", "99.99", "percent", "12.5"))).toEqual({ gross: "99.99", discount: "12.50", lineTotal: "87.49" });
  });
  it("descuento por ítem en monto", () => {
    expect(calcLine(item("1", "50000", "amount", "5000"))).toEqual({ gross: "50000.00", discount: "5000.00", lineTotal: "45000.00" });
  });
  it("tipo none ignora el valor", () => {
    expect(discountAmount("100", "none", "50")).toBe("0.00");
    expect(discountAmount("100", "amount", "")).toBe("0.00");
  });
});

describe("presupuestos · totales", () => {
  it("3 ítems con descuento por ítem y global en %", () => {
    const t = calcQuote({
      items: [item("1", "300000", "percent", "10"), item("2", "50000", "amount", "10000"), item("1", "45000")],
      globalDiscountType: "percent",
      globalDiscountValue: "5",
    });
    // brutos: 300000 + 100000 + 45000 = 445000; desc. ítems: 30000 + 10000 = 40000; neto 405000; global 5 % = 20250
    expect(t.subtotal).toBe("445000.00");
    expect(t.itemsDiscount).toBe("40000.00");
    expect(t.netItems).toBe("405000.00");
    expect(t.globalDiscount).toBe("20250.00");
    expect(t.discountTotal).toBe("60250.00");
    expect(t.total).toBe("384750.00");
    expect(t.issues).toEqual([]);
  });
  it("descuento global en monto", () => {
    const t = calcQuote({ items: [item("1", "1000")], globalDiscountType: "amount", globalDiscountValue: "250.50" });
    expect(t.total).toBe("749.50");
  });
  it("redondeo del descuento global en % sobre un neto con centavos", () => {
    const t = calcQuote({ items: [item("3", "33.33")], globalDiscountType: "percent", globalDiscountValue: "33.33" });
    // 99.99 × 33.33 % = 33.326667 → 33.33
    expect(t.globalDiscount).toBe("33.33");
    expect(t.total).toBe("66.66");
  });
  it("sin ítems es un problema", () => {
    expect(calcQuote({ items: [], globalDiscountType: "none", globalDiscountValue: "0" }).issues[0]?.path).toBe("items");
  });
  it("un descuento por ítem no puede superar el importe", () => {
    const t = calcQuote({ items: [item("1", "100", "amount", "150")], globalDiscountType: "none", globalDiscountValue: "0" });
    expect(t.issues).toEqual([{ path: "items.0.discountValue", message: "El descuento supera el importe del ítem" }]);
  });
  it("un descuento % no puede superar 100", () => {
    const t = calcQuote({ items: [item("1", "100", "percent", "120")], globalDiscountType: "none", globalDiscountValue: "0" });
    expect(t.issues[0]?.path).toBe("items.0.discountValue");
  });
  it("el descuento global no puede superar el subtotal", () => {
    const t = calcQuote({ items: [item("1", "100", "amount", "40")], globalDiscountType: "amount", globalDiscountValue: "60.01" });
    expect(t.issues).toEqual([{ path: "globalDiscountValue", message: "El descuento global supera el subtotal" }]);
  });
  it("un descuento del 100 % es válido y deja el total en cero", () => {
    const t = calcQuote({ items: [item("1", "100")], globalDiscountType: "percent", globalDiscountValue: "100" });
    expect(t.total).toBe("0.00");
    expect(t.issues).toEqual([]);
  });
  it("precio cero es válido (ítem bonificado)", () => {
    expect(calcQuote({ items: [item("1", "0")], globalDiscountType: "none", globalDiscountValue: "0" }).issues).toEqual([]);
  });
});

describe("presupuestos · plan de cobro", () => {
  it("pago único", () => {
    expect(paymentSchedule({ kind: "single" }, "1000", "2026-11-04")).toEqual([
      { label: "Pago único", percent: 100, amount: "1000.00", dueDate: "2026-11-04", offsetDays: 0 },
    ]);
  });
  it("50/50 sin perder centavos", () => {
    const s = paymentSchedule(
      {
        kind: "milestones",
        items: [
          { label: "Anticipo", percent: 50 },
          { label: "Saldo", percent: 50, offsetDays: 30 },
        ],
      },
      "384750.01",
      "2026-11-04",
    );
    expect(s.map((r) => r.amount)).toEqual(["192375.01", "192375.00"]);
    expect(s[1]?.dueDate).toBe("2026-12-04");
    expect(s.reduce((a, r) => a + Number(r.amount) * 100, 0)).toBe(38475001);
  });
  it("40/30/30", () => {
    const s = paymentSchedule(
      {
        kind: "milestones",
        items: [
          { label: "A", percent: 40 },
          { label: "B", percent: 30 },
          { label: "C", percent: 30 },
        ],
      },
      "1000",
      "2026-01-01",
    );
    expect(s.map((r) => r.amount)).toEqual(["400.00", "300.00", "300.00"]);
  });
  it("los porcentajes deben sumar 100", () => {
    expect(
      planIssues({
        kind: "milestones",
        items: [
          { label: "A", percent: 50 },
          { label: "B", percent: 40 },
        ],
      })[0]?.message,
    ).toMatch(/sumar 100/);
    expect(
      planIssues({
        kind: "milestones",
        items: [
          { label: "A", percent: 33.33 },
          { label: "B", percent: 33.33 },
          { label: "C", percent: 33.34 },
        ],
      }),
    ).toEqual([]);
  });
  it("mensual con meses: cuotas mensuales con fin de mes ajustado", () => {
    const s = paymentSchedule({ kind: "monthly", amount: "45000", months: 3 }, "0", "2026-01-31");
    expect(s.map((r) => [r.label, r.amount, r.dueDate])).toEqual([
      ["Abono mensual 1/3", "45000.00", "2026-01-31"],
      ["Abono mensual 2/3", "45000.00", "2026-02-28"],
      ["Abono mensual 3/3", "45000.00", "2026-03-31"],
    ]);
  });
  it("mensual indefinido genera los primeros 12 meses", () => {
    const s = paymentSchedule({ kind: "monthly", amount: "1000", months: null }, "0", "2026-11-04");
    expect(s).toHaveLength(12);
    expect(s[11]?.dueDate).toBe("2027-10-04");
  });
  it("mensual requiere monto > 0", () => {
    expect(planIssues({ kind: "monthly", amount: "0", months: 3 })[0]?.path).toBe("paymentPlan.amount");
  });
});

describe("presupuestos · comparación de versiones", () => {
  const base = (items: ReturnType<typeof li>[], total: string) => ({ items, subtotal: total, discountTotal: "0", total, currency: "ARS" });
  const li = (description: string, quantity: string, unitPrice: string, lineTotal = unitPrice) => ({
    description,
    quantity,
    unitPrice,
    discountType: "none",
    discountValue: "0",
    lineTotal,
  });
  it("detecta ítems agregados, quitados y cambiados, y la diferencia de totales", () => {
    const a = base([li("Diseño", "1", "100"), li("Hosting", "1", "50")], "150");
    const b = base([li("diseño ", "2", "100", "200"), li("SEO", "1", "80")], "280");
    const d = diffVersions(a, b);
    expect(d.items.map((x) => x.kind)).toEqual(["changed", "removed", "added"]);
    const changed = d.items[0];
    expect(changed?.kind === "changed" ? changed.changes : []).toEqual(["quantity", "lineTotal"]);
    expect(d.totals.find((t) => t.field === "total")?.delta).toBe("130.00");
    expect(d.currencyChanged).toBe(false);
  });
});
