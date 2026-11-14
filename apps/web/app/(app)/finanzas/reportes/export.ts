import "server-only";
import { L, label, todayAR } from "@agencyos/core";
import { exportTransactions, listLedgers, monthlyReport, profitability, type TxFilters } from "@agencyos/modules/finance/queries";
import type { XCell, XSheet } from "@agencyos/modules/shared/xlsx";
import type { AppCtx } from "@/lib/session";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const n = (v: string | null | undefined): XCell => (v ? { n: v } : null);

/**
 * Datos de las exportaciones de Finanzas (CSV y XLSX comparten el mismo armado).
 * tipo = movimientos | mensual | rentabilidad. Cada "hoja" es una tabla con encabezado.
 */
export async function financeExport(ctx: AppCtx, p: URLSearchParams): Promise<{ baseName: string; sheets: XSheet[] }> {
  const ledgers = await listLedgers(ctx);
  const ledger = ledgers.find((l) => l.id === p.get("libro"));
  const today = todayAR();
  const from = DATE.test(p.get("desde") ?? "") ? (p.get("desde") as string) : `${today.slice(0, 4)}-01-01`;
  const to = DATE.test(p.get("hasta") ?? "") ? (p.get("hasta") as string) : `${today.slice(0, 4)}-12-31`;
  const currency = p.get("moneda") === "USD" ? "USD" : "ARS";
  const tipo = ["mensual", "rentabilidad"].includes(p.get("tipo") ?? "") ? (p.get("tipo") as string) : "movimientos";
  const sheets: XSheet[] = [];

  if (tipo === "mensual") {
    const rep = await monthlyReport(ctx, { ledgerId: ledger?.id, from, to, currency });
    sheets.push({
      name: "Resumen mensual",
      rows: [
        ["Mes", `Ingresos (${currency})`, `Gastos (${currency})`, `Resultado (${currency})`],
        ...rep.months.map((m) => [m.month, n(m.income), n(m.expense), n(m.result)]),
        ["Total", n(rep.totals.income), n(rep.totals.expense), n(rep.totals.result)],
      ],
    });
    sheets.push({
      name: "Por categoría",
      rows: [
        ["Tipo", "Categoría", `Total (${currency})`],
        ...[...rep.categories.income, ...rep.categories.expense].map((c) => [label(L.txKind, c.kind), c.name, n(c.total)]),
      ],
    });
    if (rep.unconverted.length)
      sheets.push({
        name: "Sin cotización",
        rows: [
          ["Tipo (no incluidos)", "Moneda", "Total", "Movimientos"],
          ...rep.unconverted.map((u) => [label(L.txKind, u.kind), u.currency, n(u.total), { n: String(u.n) }]),
        ],
      });
  } else if (tipo === "rentabilidad") {
    const prof = await profitability(ctx, { ledgerId: ledger?.id, from, to, currency });
    sheets.push({
      name: "Rentabilidad",
      rows: [
        ["Tipo", "Nombre", `Cobrado (${currency})`, `Gastos (${currency})`, `Resultado (${currency})`, "Movimientos sin cotización"],
        ...prof.clients.map((r) => ["Cliente", r.name, n(r.income), n(r.expense), n(r.result), { n: String(r.unconverted) }]),
        ...prof.projects.map((r) => ["Proyecto", r.name, n(r.income), n(r.expense), n(r.result), { n: String(r.unconverted) }]),
      ],
    });
  } else {
    const kind = p.get("clase");
    const f: TxFilters = {
      ledgerId: ledger?.id,
      from,
      to,
      accountId: p.get("cuenta") || undefined,
      categoryId: p.get("categoria") || undefined,
      kind: kind === "income" || kind === "expense" || kind === "transfer" ? kind : undefined,
      q: p.get("q") || undefined,
    };
    const rows = await exportTransactions(ctx, f);
    sheets.push({
      name: "Movimientos",
      rows: [
        ["Fecha", "Tipo", "Libro", "Cuenta", "Moneda", "Monto", "Cotización (ARS por US$ 1)", "Categoría", "Cliente", "Proyecto", "Contraparte", "Descripción"],
        ...rows.map((t) => {
          const signed = t.kind === "expense" || t.kind === "transfer_out" ? `-${t.amount}` : t.amount;
          const cat = t.categoryName ? (t.parentCategoryName ? `${t.parentCategoryName} › ${t.categoryName}` : t.categoryName) : "";
          return [
            t.date,
            label(L.txKind, t.kind),
            t.ledgerName ?? "",
            t.accountName ?? "",
            t.currency,
            n(signed),
            n(t.exchangeRate),
            cat,
            t.clientName ?? "",
            t.projectName ?? "",
            t.counterpart ?? t.pairAccountName ?? "",
            t.description ?? "",
          ] as XCell[];
        }),
      ],
    });
  }
  const baseName = `finanzas-${tipo}-${ledger ? ledger.name.toLowerCase() : "todo"}-${from}_${to}`.replace(/[^\w.-]/g, "_");
  return { baseName, sheets };
}

/** CSV para Excel/Sheets en es-AR: `;`, coma decimal, BOM y fórmulas neutralizadas. */
export function toCsv(sheets: XSheet[]): string {
  const cell = (c: XCell) => {
    if (c === null) return "";
    if (typeof c === "object") return c.n.replace(".", ",");
    const s = c.replace(/[\r\n]+/g, " ");
    const safe = /^[=+\-@\t]/.test(s) ? `'${s}` : s;
    return /[";]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const blocks = sheets.map((s) => s.rows.map((r) => r.map(cell).join(";")).join("\r\n"));
  return `﻿${blocks.join("\r\n\r\n")}\r\n`;
}
