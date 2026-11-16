import { describe, expect, it } from "vitest";
import { type FinanceReportDoc, financeReportHeaderFooter, renderFinanceReportHtml } from "../../packages/pdf/src/finance-report"; // @agencyos/pdf no es dependencia de la raíz

const doc: FinanceReportDoc = {
  brand: { name: "Luciano Rosano", initials: "LR", email: null, phone: null, website: null },
  periodLabel: "Marzo 2026",
  year: 2026,
  currency: "ARS",
  ledgerName: "Agencia",
  generatedOn: "2026-04-02",
  totals: { income: "150000.00", expense: "200000.00", result: "-50000.00" },
  months: [
    { label: "Febrero", income: "1000.00", expense: "0.00", result: "1000.00", current: false },
    { label: "Marzo", income: "150000.00", expense: "200000.00", result: "-50000.00", current: true },
  ],
  yearTotals: { income: "151000.00", expense: "200000.00", result: "-49000.00" },
  categories: { income: [{ name: "Diseño <web>", total: "150000.00" }], expense: [] },
  clients: [{ name: "Panadería", income: "150000.00", expense: "0.00", result: "150000.00", unconverted: 1 }],
  projects: [],
  unconverted: [{ kind: "Ingresos", currency: "USD", total: "100.00", n: 1 }],
};

describe("informe PDF de finanzas (HTML)", () => {
  it("arma las secciones con la marca, escapa texto y marca negativos con signo", () => {
    const html = renderFinanceReportHtml(doc);
    expect(html).toContain("Marzo 2026");
    expect(html).toContain("Libro Agencia");
    expect(html).toContain("Resumen mensual · 2026");
    expect(html).toContain("Rentabilidad por cliente");
    expect(html).toContain("Diseño &lt;web&gt;");
    expect(html).not.toContain("Diseño <web>");
    expect(html).toMatch(/−\$\s?50\.000/);
    expect(html).toContain("sin cotización");
    expect(html).toContain("Sin ingresos ni gastos asignados a un proyecto");
    const { header, footer } = financeReportHeaderFooter(doc);
    expect(header).toContain("Luciano Rosano");
    expect(footer).toContain("pageNumber");
  });
});
