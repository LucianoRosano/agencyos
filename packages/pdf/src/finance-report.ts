/**
 * Informe PDF de Finanzas (resumen mensual, categorías y rentabilidad): A4, márgenes de 18 mm,
 * Geist, encabezado con la marca y pie con página y fecha — el mismo estilo que los presupuestos.
 * Legible en blanco y negro: los negativos llevan signo y las barras van con su monto escrito.
 * Plantilla pura (sin Node ni navegador).
 */
import { formatDate, formatMoney } from "@agencyos/core";
import { geistFontCss } from "./fonts";
import { htmlToPdf } from "./render";

export type FinanceReportRow = { name: string; income: string; expense: string; result: string; unconverted: number };
export type FinanceReportDoc = {
  brand: { name: string; initials: string; email: string | null; phone: string | null; website: string | null };
  /** «Marzo 2026» o «Año 2026» */
  periodLabel: string;
  year: number;
  currency: "ARS" | "USD";
  ledgerName: string | null;
  generatedOn: string; // YYYY-MM-DD
  totals: { income: string; expense: string; result: string };
  months: { label: string; income: string; expense: string; result: string; current: boolean }[];
  yearTotals: { income: string; expense: string; result: string };
  categories: { income: { name: string; total: string }[]; expense: { name: string; total: string }[] };
  clients: FinanceReportRow[];
  projects: FinanceReportRow[];
  unconverted: { kind: string; currency: string; total: string; n: number }[];
};

const esc = (s: string | number | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const CSS = `
:root { --ink:#111114; --muted:#55565e; --faint:#8a8b93; --rule:#d9d9de; --soft:#f4f4f6; --accent:#34D399; }
* { box-sizing:border-box; }
html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { margin:0; color:var(--ink); font-family:"Geist", ui-sans-serif, system-ui, sans-serif; font-size:10pt; line-height:1.5; font-feature-settings:"tnum" 1; }
h1,h2 { margin:0; font-weight:600; letter-spacing:-0.015em; }
h1 { font-size:24pt; line-height:1.15; margin:8px 0 6px; }
h2 { font-size:13pt; margin:26px 0 10px; display:flex; gap:10px; align-items:baseline; break-after:avoid; }
h2 .idx { font-size:9pt; color:var(--faint); font-weight:500; letter-spacing:0.08em; }
h3 { margin:0 0 6px; font-size:9pt; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted); }
p { margin:0 0 6px; }
.eyebrow { font-size:8pt; letter-spacing:0.18em; text-transform:uppercase; color:var(--muted); }
.rule { height:2px; width:44px; background:var(--accent); border-radius:2px; margin:0 0 12px; }
.muted { color:var(--muted); }
.num { font-variant-numeric:tabular-nums; white-space:nowrap; }
.facts { display:grid; grid-template-columns:repeat(3,1fr); border:1px solid var(--ink); border-radius:10px; margin-top:18px; overflow:hidden; }
.facts > div { padding:12px 14px; border-left:1px solid var(--rule); }
.facts > div:first-child { border-left:0; }
.facts .k { font-size:7.5pt; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted); }
.facts .v { font-size:14pt; font-weight:600; margin-top:3px; }
table { width:100%; border-collapse:collapse; font-size:9pt; }
th { text-align:left; font-size:7.5pt; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); font-weight:500; padding:0 6px 6px; border-bottom:1.5px solid var(--ink); }
td { padding:6px 6px; border-bottom:1px solid var(--rule); vertical-align:top; }
tr { break-inside:avoid; }
tr.cur td { background:var(--soft); }
tr.total td { font-weight:600; border-top:1.5px solid var(--ink); border-bottom:0; }
.r { text-align:right; }
.cols { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
.bars { display:flex; flex-direction:column; gap:7px; }
.bar { break-inside:avoid; }
.bar .top { display:flex; justify-content:space-between; gap:10px; font-size:9pt; }
.bar .track { height:6px; border-radius:3px; background:var(--soft); margin-top:3px; overflow:hidden; border:0.5px solid var(--rule); }
.bar .fill { height:100%; background:var(--ink); border-radius:3px; }
.bar.inc .fill { background:#2f9e74; }
.note { border:1px dashed var(--ink); border-radius:10px; padding:10px 12px; font-size:9pt; margin-top:14px; }
.empty { color:var(--faint); font-size:9pt; }
@page { size:A4; margin:18mm; }
`;

const signed = (v: string, c: string) => (Number(v) < 0 ? `−${formatMoney(v.replace(/^-/, ""), c)}` : formatMoney(v, c));

function bars(rows: { name: string; total: string }[], c: string, cls: string) {
  if (!rows.length) return '<p class="empty">Sin movimientos en el período.</p>';
  const max = Math.max(...rows.map((r) => Math.abs(Number(r.total))), 1);
  return `<div class="bars">${rows
    .slice(0, 12)
    .map(
      (r) =>
        `<div class="bar ${cls}"><div class="top"><span>${esc(r.name)}</span><span class="num">${esc(formatMoney(r.total, c))}</span></div><div class="track"><div class="fill" style="width:${Math.max(1, Math.round((Math.abs(Number(r.total)) / max) * 100))}%"></div></div></div>`,
    )
    .join("")}${rows.length > 12 ? `<p class="muted" style="font-size:8.5pt">… y ${rows.length - 12} categorías más (ver Excel).</p>` : ""}</div>`;
}

function profTable(rows: FinanceReportRow[], c: string, who: string) {
  if (!rows.length) return `<p class="empty">Sin ingresos ni gastos asignados a un ${who.toLowerCase()} en el período.</p>`;
  return `<table><thead><tr><th>${esc(who)}</th><th class="r">Cobrado</th><th class="r">Gastos</th><th class="r">Resultado</th></tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><td>${esc(r.name)}${r.unconverted ? " *" : ""}</td><td class="r num">${esc(formatMoney(r.income, c))}</td><td class="r num">${esc(formatMoney(r.expense, c))}</td><td class="r num">${esc(signed(r.result, c))}</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table>${rows.some((r) => r.unconverted) ? '<p class="muted" style="font-size:8.5pt;margin-top:4px">* Tiene movimientos en otra moneda sin cotización, fuera del cálculo.</p>' : ""}`;
}

export function renderFinanceReportHtml(doc: FinanceReportDoc, opts: { fontCss?: string } = {}): string {
  const c = doc.currency;
  let idx = 0;
  const h2 = (t: string) => `<h2><span class="idx">${String(++idx).padStart(2, "0")}</span>${esc(t)}</h2>`;
  const months = doc.months.length
    ? `<table><thead><tr><th>Mes</th><th class="r">Ingresos</th><th class="r">Gastos</th><th class="r">Resultado</th></tr></thead><tbody>${doc.months
        .map(
          (m) =>
            `<tr${m.current ? ' class="cur"' : ""}><td>${esc(m.label)}${m.current ? " ◂" : ""}</td><td class="r num">${esc(formatMoney(m.income, c))}</td><td class="r num">${esc(formatMoney(m.expense, c))}</td><td class="r num">${esc(signed(m.result, c))}</td></tr>`,
        )
        .join(
          "",
        )}<tr class="total"><td>Total ${doc.year}</td><td class="r num">${esc(formatMoney(doc.yearTotals.income, c))}</td><td class="r num">${esc(formatMoney(doc.yearTotals.expense, c))}</td><td class="r num">${esc(signed(doc.yearTotals.result, c))}</td></tr></tbody></table>`
    : `<p class="empty">Sin movimientos en ${doc.year}.</p>`;
  const unconv = doc.unconverted.length
    ? `<p class="note"><b>Movimientos en otra moneda sin cotización (no se suman a los totales en ${esc(c)}):</b> ${doc.unconverted
        .map((u) => `${esc(u.kind)} en ${esc(u.currency)}: <span class="num">${esc(formatMoney(u.total, u.currency))}</span> (${u.n} mov.)`)
        .join(" · ")}.</p>`
    : "";
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>Informe de finanzas · ${esc(doc.periodLabel)}</title>
<style>${opts.fontCss ?? ""}${CSS}</style></head><body>
<p class="eyebrow">Informe de finanzas · ${esc(c)}${doc.ledgerName ? ` · Libro ${esc(doc.ledgerName)}` : " · Todos los libros"}</p>
<div class="rule"></div>
<h1>${esc(doc.periodLabel)}</h1>
<p class="muted">Preparado por ${esc(doc.brand.name)} el ${esc(formatDate(doc.generatedOn))}. Montos en ${c === "ARS" ? "pesos argentinos" : "dólares estadounidenses"} con la cotización cargada en cada movimiento.</p>
<div class="facts">
  <div><div class="k">Ingresos</div><div class="v num">${esc(formatMoney(doc.totals.income, c))}</div></div>
  <div><div class="k">Gastos</div><div class="v num">${esc(formatMoney(doc.totals.expense, c))}</div></div>
  <div><div class="k">Resultado</div><div class="v num">${esc(signed(doc.totals.result, c))}</div></div>
</div>
${unconv}
${h2(`Resumen mensual · ${doc.year}`)}
${months}
${h2(`Por categoría · ${doc.periodLabel}`)}
<div class="cols"><div><h3>Ingresos</h3>${bars(doc.categories.income, c, "inc")}</div><div><h3>Gastos</h3>${bars(doc.categories.expense, c, "exp")}</div></div>
${h2(`Rentabilidad por cliente · ${doc.periodLabel}`)}
${profTable(doc.clients, c, "Cliente")}
${h2(`Rentabilidad por proyecto · ${doc.periodLabel}`)}
${profTable(doc.projects, c, "Proyecto")}
<p class="muted" style="font-size:8.5pt;margin-top:16px">Rentabilidad = cobrado − gastos asignados al cliente o proyecto. Datos reales registrados en AGENCYOS; el detalle por movimiento está en la exportación a Excel.</p>
</body></html>`;
}

export function financeReportHeaderFooter(doc: Pick<FinanceReportDoc, "brand" | "periodLabel" | "generatedOn">, fontCss = "") {
  const base = `${fontCss}<style>*{font-family:"Geist",ui-sans-serif,system-ui,sans-serif;-webkit-print-color-adjust:exact;}</style>`;
  const header = `${base}<div style="width:100%;padding:0 18mm;display:flex;align-items:center;justify-content:space-between;font-size:7.5pt;color:#55565e;">
    <span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border:0.8px solid #111114;border-radius:4px;font-size:6pt;font-weight:600;color:#111114;">${esc(doc.brand.initials)}</span><span style="color:#111114;font-weight:600;">${esc(doc.brand.name)}</span></span>
    <span>Informe de finanzas · ${esc(doc.periodLabel)}</span></div>`;
  const footer = `${base}<div style="width:100%;padding:0 18mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#55565e;">
    <span>${esc(doc.brand.name)} · ${esc(formatDate(doc.generatedOn))} · Uso interno</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
  return { header, footer };
}

export async function renderFinanceReportPdf(doc: FinanceReportDoc): Promise<Buffer> {
  const fontCss = geistFontCss();
  const html = renderFinanceReportHtml(doc, { fontCss });
  const { header, footer } = financeReportHeaderFooter(doc, `<style>${fontCss}</style>`);
  return htmlToPdf(html, { headerTemplate: header, footerTemplate: footer });
}
