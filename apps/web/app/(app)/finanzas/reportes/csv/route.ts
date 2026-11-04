import { can, L, label, todayAR } from "@agencyos/core";
import { exportTransactions, listLedgers, monthlyReport, profitability, type TxFilters } from "@agencyos/modules/finance/queries";
import { requireCtx } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Exportación CSV autenticada (solo dueño/admin). Separador `;` y coma decimal (Excel/Sheets en es-AR), UTF-8 con BOM.
 * tipo = movimientos | mensual | rentabilidad
 */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Evita inyección de fórmulas en planillas en columnas de texto. */
const text = (v: string | null | undefined) => {
  const s = (v ?? "").replace(/[\r\n]+/g, " ");
  const safe = /^[=+\-@\t]/.test(s) ? `'${s}` : s;
  return /[";]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const num = (v: string | null | undefined) => (v ?? "").replace(".", ",");
const row = (cells: string[]) => cells.join(";");

export async function GET(req: Request) {
  const ctx = await requireCtx();
  if (!can(ctx, "read", "finance"))
    return new Response("No tenés permiso para exportar finanzas.", {
      status: 403,
    });
  const url = new URL(req.url);
  const p = url.searchParams;
  const ledgers = await listLedgers(ctx);
  const ledger = ledgers.find((l) => l.id === p.get("libro"));
  const today = todayAR();
  const from = DATE.test(p.get("desde") ?? "") ? (p.get("desde") as string) : `${today.slice(0, 4)}-01-01`;
  const to = DATE.test(p.get("hasta") ?? "") ? (p.get("hasta") as string) : `${today.slice(0, 4)}-12-31`;
  const currency = p.get("moneda") === "USD" ? "USD" : "ARS";
  const tipo = p.get("tipo") ?? "movimientos";
  const lines: string[] = [];

  if (tipo === "mensual") {
    const rep = await monthlyReport(ctx, {
      ledgerId: ledger?.id,
      from,
      to,
      currency,
    });
    lines.push(row(["Mes", `Ingresos (${currency})`, `Gastos (${currency})`, `Resultado (${currency})`]));
    for (const m of rep.months) lines.push(row([m.month, num(m.income), num(m.expense), num(m.result)]));
    lines.push(row(["Total", num(rep.totals.income), num(rep.totals.expense), num(rep.totals.result)]));
    lines.push("");
    lines.push(row(["Tipo", "Categoría", `Total (${currency})`]));
    for (const c of [...rep.categories.income, ...rep.categories.expense]) lines.push(row([label(L.txKind, c.kind), text(c.name), num(c.total)]));
    if (rep.unconverted.length) {
      lines.push("");
      lines.push(row(["Sin cotización (no incluidos)", "Moneda", "Total", "Movimientos"]));
      for (const u of rep.unconverted) lines.push(row([label(L.txKind, u.kind), u.currency, num(u.total), String(u.n)]));
    }
  } else if (tipo === "rentabilidad") {
    const prof = await profitability(ctx, {
      ledgerId: ledger?.id,
      from,
      to,
      currency,
    });
    lines.push(row(["Tipo", "Nombre", `Cobrado (${currency})`, `Gastos (${currency})`, `Resultado (${currency})`, "Movimientos sin cotización"]));
    for (const r of prof.clients) lines.push(row(["Cliente", text(r.name), num(r.income), num(r.expense), num(r.result), String(r.unconverted)]));
    for (const r of prof.projects) lines.push(row(["Proyecto", text(r.name), num(r.income), num(r.expense), num(r.result), String(r.unconverted)]));
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
    lines.push(row(["Fecha", "Tipo", "Libro", "Cuenta", "Moneda", "Monto", "Cotización (ARS por US$ 1)", "Categoría", "Cliente", "Proyecto", "Contraparte", "Descripción"]));
    for (const t of rows) {
      const signed = t.kind === "expense" || t.kind === "transfer_out" ? `-${t.amount}` : t.amount;
      const cat = t.categoryName ? (t.parentCategoryName ? `${t.parentCategoryName} › ${t.categoryName}` : t.categoryName) : "";
      lines.push(
        row([
          t.date,
          label(L.txKind, t.kind),
          text(t.ledgerName),
          text(t.accountName),
          t.currency,
          num(signed),
          num(t.exchangeRate),
          text(cat),
          text(t.clientName),
          text(t.projectName),
          text(t.counterpart ?? t.pairAccountName),
          text(t.description),
        ]),
      );
    }
  }

  const name = `finanzas-${tipo}-${ledger ? ledger.name.toLowerCase() : "todo"}-${from}_${to}.csv`;
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
