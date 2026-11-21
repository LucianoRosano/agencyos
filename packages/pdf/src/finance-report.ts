/**
 * Informe PDF de Finanzas (resumen mensual, categorías y rentabilidad): A4, márgenes de 18 mm,
 * papelería común (Inter + Source Serif), encabezado con la marca y pie con página y fecha — el mismo estilo que los presupuestos.
 * Legible en blanco y negro: los negativos llevan signo y las barras van con su monto escrito.
 * Plantilla pura (sin Node ni navegador).
 */
import { formatDate, formatMoney } from "@agencyos/core";
import { docFontCss } from "./fonts";
import { esc, letterhead, PAPER_CSS, pageChrome, sectionCounter } from "./paper";
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

const CSS = `
.hero { margin:40px 0 0; }
.hero .rule { height:2pt; width:46px; background:var(--accent); margin:0 0 14px; }
h3 { margin:0 0 8px; font-size:7pt; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); }
.cols { display:grid; grid-template-columns:1fr 1fr; gap:28px; }
.bars { display:flex; flex-direction:column; gap:8px; }
.bars .row { break-inside:avoid; }
.bars .top { display:flex; justify-content:space-between; gap:10px; font-size:9pt; }
.bars .bar { margin-top:3px; }
.bars .inc .bar > i { background:var(--accent); }
.empty { color:var(--faint); font-size:9pt; }
`;

const signed = (v: string, c: string) => (Number(v) < 0 ? `−${formatMoney(v.replace(/^-/, ""), c)}` : formatMoney(v, c));

function bars(rows: { name: string; total: string }[], c: string, cls: string) {
  if (!rows.length) return '<p class="empty">Sin movimientos en el período.</p>';
  const max = Math.max(...rows.map((r) => Math.abs(Number(r.total))), 1);
  return `<div class="bars">${rows
    .slice(0, 12)
    .map(
      (r) =>
        `<div class="row ${cls}"><div class="top"><span>${esc(r.name)}</span><span class="num">${esc(formatMoney(r.total, c))}</span></div><div class="bar"><i style="width:${Math.max(1, Math.round((Math.abs(Number(r.total)) / max) * 100))}%"></i></div></div>`,
    )
    .join("")}${rows.length > 12 ? `<p class="muted small">… y ${rows.length - 12} categorías más (ver Excel).</p>` : ""}</div>`;
}

function profTable(rows: FinanceReportRow[], c: string, who: string) {
  if (!rows.length) return `<p class="empty">Sin ingresos ni gastos asignados a un ${who.toLowerCase()} en el período.</p>`;
  return `<table class="t"><thead><tr><th>${esc(who)}</th><th class="r">Cobrado</th><th class="r">Gastos</th><th class="r">Resultado</th></tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><td>${esc(r.name)}${r.unconverted ? " *" : ""}</td><td class="r num">${esc(formatMoney(r.income, c))}</td><td class="r num">${esc(formatMoney(r.expense, c))}</td><td class="r num">${esc(signed(r.result, c))}</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table>${rows.some((r) => r.unconverted) ? '<p class="muted small" style="margin-top:6px">* Tiene movimientos en otra moneda sin cotización, fuera del cálculo.</p>' : ""}`;
}

export function renderFinanceReportHtml(doc: FinanceReportDoc, opts: { fontCss?: string } = {}): string {
  const c = doc.currency;
  const h2 = sectionCounter();
  const months = doc.months.length
    ? `<table class="t"><thead><tr><th>Mes</th><th class="r">Ingresos</th><th class="r">Gastos</th><th class="r">Resultado</th></tr></thead><tbody>${doc.months
        .map(
          (m) =>
            `<tr${m.current ? ' class="cur"' : ""}><td>${esc(m.label)}${m.current ? " ◂" : ""}</td><td class="r num">${esc(formatMoney(m.income, c))}</td><td class="r num">${esc(formatMoney(m.expense, c))}</td><td class="r num">${esc(signed(m.result, c))}</td></tr>`,
        )
        .join(
          "",
        )}<tr class="total"><td>Total ${doc.year}</td><td class="r num">${esc(formatMoney(doc.yearTotals.income, c))}</td><td class="r num">${esc(formatMoney(doc.yearTotals.expense, c))}</td><td class="r num">${esc(signed(doc.yearTotals.result, c))}</td></tr></tbody></table>`
    : `<p class="empty">Sin movimientos en ${doc.year}.</p>`;
  const unconv = doc.unconverted.length
    ? `<p class="note" style="margin-top:14px"><b>Movimientos en otra moneda sin cotización (no se suman a los totales en ${esc(c)}):</b> ${doc.unconverted
        .map((u) => `${esc(u.kind)} en ${esc(u.currency)}: <span class="num">${esc(formatMoney(u.total, u.currency))}</span> (${u.n} mov.)`)
        .join(" · ")}.</p>`
    : "";
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>Informe de finanzas · ${esc(doc.periodLabel)}</title>
<style>${opts.fontCss ?? ""}${PAPER_CSS}${CSS}</style></head><body>
${letterhead(doc.brand, { sub: "Uso interno" })}
<div class="hero">
<div class="rule"></div>
<p class="eyebrow">Informe de finanzas · ${esc(c)}${doc.ledgerName ? ` · Libro ${esc(doc.ledgerName)}` : " · Todos los libros"}</p>
<h1>${esc(doc.periodLabel)}</h1>
<p class="muted">Preparado por ${esc(doc.brand.name)} el <span class="num">${esc(formatDate(doc.generatedOn))}</span>. Montos en ${c === "ARS" ? "pesos argentinos" : "dólares estadounidenses"} con la cotización cargada en cada movimiento.</p>
</div>
<div class="facts" style="--cols:3">
  <div><div class="k">Ingresos</div><div class="v big num">${esc(formatMoney(doc.totals.income, c))}</div></div>
  <div><div class="k">Gastos</div><div class="v big num">${esc(formatMoney(doc.totals.expense, c))}</div></div>
  <div class="hl"><div class="k">Resultado</div><div class="v big num">${esc(signed(doc.totals.result, c))}</div></div>
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
<p class="closing"><span>Rentabilidad = cobrado − gastos asignados al cliente o proyecto. Datos reales registrados en AGENCYOS; el detalle por movimiento está en la exportación a Excel.</span></p>
</body></html>`;
}

export function financeReportHeaderFooter(doc: Pick<FinanceReportDoc, "brand" | "periodLabel" | "generatedOn">, fontCss = "") {
  return pageChrome({
    brand: doc.brand,
    fontCss,
    right: `Informe de finanzas · ${esc(doc.periodLabel)}`,
    footerLeft: `${esc(doc.brand.name)} · ${esc(formatDate(doc.generatedOn))} · Uso interno`,
  });
}

export async function renderFinanceReportPdf(doc: FinanceReportDoc): Promise<Buffer> {
  const fontCss = docFontCss();
  const html = renderFinanceReportHtml(doc, { fontCss });
  const { header, footer } = financeReportHeaderFooter(doc, fontCss);
  return htmlToPdf(html, { headerTemplate: header, footerTemplate: footer });
}
