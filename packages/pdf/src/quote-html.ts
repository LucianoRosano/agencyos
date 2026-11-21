/**
 * Plantilla HTML del presupuesto (la misma para el PDF y para la vista previa en vivo).
 * Pura: sin Node ni navegador. Pensada para imprimirse en blanco y negro: el color nunca
 * es la única forma de transmitir información (docs/07 §5).
 */
import { formatDate, formatMoney, L, label } from "@agencyos/core";
import { marked } from "marked";
import { letterhead, PAPER_CSS, pageChrome, sectionCounter } from "./paper";

export type QuoteDocBrand = {
  name: string;
  initials: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  footer: string | null;
};
export type QuoteDocItem = {
  description: string;
  quantity: string;
  unit: string | null;
  unitPrice: string;
  discountType: string;
  discountValue: string;
  discount: string;
  lineTotal: string;
};
export type QuoteDocPlanRow = { label: string; percent: number | null; amount: string; offsetDays: number };
export type QuoteDoc = {
  brand: QuoteDocBrand;
  number: string;
  version: number;
  title: string;
  currency: string;
  exchangeRateRef: string | null;
  issueDate: string;
  validUntil: string;
  client: { name: string; legalName: string | null; taxId: string | null };
  contact: { name: string; email: string | null; phone: string | null } | null;
  introMd: string | null;
  scopeMd: string | null;
  exclusionsMd: string | null;
  termsMd: string | null;
  notesMd: string | null;
  items: QuoteDocItem[];
  totals: { subtotal: string; itemsDiscount: string; globalDiscountType: string; globalDiscountValue: string; globalDiscount: string; total: string };
  plan: { kind: string; monthlyAmount: string | null; months: number | null; rows: QuoteDocPlanRow[] };
};

export type RenderOptions = {
  /** CSS con el @font-face de las fuentes (data URL para el PDF, URL para la vista previa). */
  fontCss?: string;
  /** Vista previa en pantalla: hojas con sombra en vez de páginas impresas. */
  preview?: boolean;
};

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Markdown → HTML sin HTML crudo (se neutraliza `<`) ni esquemas peligrosos en los enlaces. */
export function mdToHtml(md: string | null | undefined): string {
  if (!md?.trim()) return "";
  const safe = md.replace(/</g, "&lt;");
  const html = marked.parse(safe, { async: false, gfm: true, breaks: true }) as string;
  return html.replace(/href="(?!https?:|mailto:)[^"]*"/gi, 'href="#"').replace(/<img[^>]*>/gi, "");
}

const qtyFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const fmtQty = (q: string) => qtyFmt.format(Number(q));
const fmtPct = (p: string | number) => `${pctFmt.format(Number(p))} %`;

function unitText(qty: string, unit: string | null) {
  if (!unit) return fmtQty(qty);
  const l = label(L.serviceUnit, unit).toLowerCase();
  const n = Number(qty);
  const plural = n === 1 ? l : l.endsWith("s") ? l : /[aeiouáéó]$/.test(l) ? `${l}s` : `${l}es`;
  return `${fmtQty(qty)} ${plural}`;
}

function whenText(offsetDays: number) {
  if (!offsetDays) return "A la aceptación";
  return `A los ${offsetDays} días`;
}

const CSS = `
body { font-size:10.5pt; }
.cover { display:flex; flex-direction:column; min-height:calc(297mm - 36mm - 16mm); }
.cover .hero { margin-top:64px; }
.cover .rule { height:2pt; width:46px; background:var(--accent); margin:0 0 16px; }
.cover h1 { font-size:31pt; max-width:15.5cm; margin:12px 0 16px; }
.cover .for { font-size:11.5pt; color:var(--muted); }
.cover .for strong { color:var(--ink); font-weight:600; }
.cover .intro { margin-top:30px; max-width:15.5cm; font-size:11pt; line-height:1.6; }
.cover .intro p:first-child::first-letter { font-family:var(--serif); }
.cover .foot { margin-top:auto; padding-top:12px; border-top:0.5pt solid var(--rule); display:flex; justify-content:space-between; gap:12px; font-size:8pt; color:var(--muted); }

section.block { margin:0 0 20px; break-inside:auto; }
section.block > h2:first-child { margin-top:0; }
.md { color:#2b251f; }
.md ul, .md ol { margin:4px 0 8px; padding-left:18px; }
.md li { margin:2px 0; }
.md li::marker { color:var(--accent); }
.md strong { color:var(--ink); }
.md p:last-child { margin-bottom:0; }
.cols { display:grid; grid-template-columns:1fr 1fr; gap:28px; }
dl.sum { margin:0; display:grid; grid-template-columns:auto 1fr; gap:5px 14px; font-size:9.5pt; }
dl.sum dt { color:var(--muted); }
dl.sum dd { margin:0; font-weight:500; }

table.items { font-size:9.5pt; }
table.items td { padding:9px 8px; }
table.items .n { color:var(--faint); width:22px; }
table.items .desc { font-weight:500; }

.totals { margin-top:12px; display:flex; justify-content:flex-end; break-inside:avoid; }
.totals table { border-collapse:collapse; min-width:8.5cm; font-size:10pt; }
.totals td { padding:4px 0; }
.totals td.r { text-align:right; padding-left:28px; }
.totals .grand td { border-top:2.2pt double var(--ink); padding-top:10px; }
.totals .grand .lbl { font-size:7.5pt; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; vertical-align:middle; }
.totals .grand .r { font-family:var(--serif); font-size:19pt; font-weight:600; color:var(--accent); }
.totals .fine td { font-size:8pt; color:var(--muted); padding-top:6px; }

table.plan { break-inside:avoid; font-size:9.5pt; }

.validity { border:0.6pt solid var(--ink); border-radius:4px; padding:11px 14px; display:flex; justify-content:space-between; align-items:center; gap:16px; break-inside:avoid; }
.accept { border:0.6pt solid var(--ink); border-radius:4px; padding:16px 18px; break-inside:avoid; position:relative; }
.accept::before { content:""; position:absolute; inset:3pt; border:0.4pt solid var(--rule); border-radius:2px; pointer-events:none; }

@media print {
  .sheet.cover { break-after:page; }
}
@media screen {
  html { background:#e9e4db; }
  body { padding:24px 12px; }
  .sheet { background:#fff; width:100%; max-width:210mm; margin:0 auto 20px; padding:18mm; border-radius:3px; box-shadow:0 1px 2px rgba(60,40,20,.08), 0 12px 32px -12px rgba(60,40,20,.28); }
  .cover { min-height:calc(297mm - 36mm); }
}
@media screen and (max-width:640px) {
  body { padding:10px 8px; font-size:10pt; }
  .sheet { padding:20px 16px; }
  .cover { min-height:0; }
  .letterhead { flex-direction:column; gap:10px; }
  .contact { text-align:left; }
  .cover .hero { margin-top:28px; }
  .cover h1 { font-size:22pt; }
  .facts { grid-template-columns:1fr 1fr; }
  .facts > div:nth-child(3) { border-left:0; padding-left:0; }
  .facts > div:nth-child(n+3) { border-top:0.5pt solid var(--rule); }
  .cols { grid-template-columns:1fr; gap:14px; }
  table.items thead { display:none; }
  table.items, table.items tbody, table.items tr, table.items td { display:block; width:100%; }
  table.items tr { border-bottom:0.5pt solid var(--rule); padding:8px 0; display:grid; grid-template-columns:1fr auto; gap:2px 12px; }
  table.items td { border:0; padding:0 !important; text-align:left !important; }
  table.items td.n { display:none; }
  table.items td.desc { grid-column:1 / -1; }
  table.items td.qty, table.items td.price, table.items td.disc { font-size:8.5pt; color:var(--muted); grid-column:1; }
  table.items td.total { grid-column:2; grid-row:2 / span 3; align-self:center; font-weight:600; }
  .totals table { min-width:0; width:100%; }
  .sign { grid-template-columns:1fr; gap:26px; }
  .validity { flex-direction:column; align-items:flex-start; }
}
`;

export function renderQuoteHtml(doc: QuoteDoc, opts: RenderOptions = {}): string {
  const cur = doc.currency;
  const hasCents = [
    ...doc.items.flatMap((i) => [i.unitPrice, i.lineTotal, i.discount]),
    doc.totals.subtotal,
    doc.totals.total,
    doc.totals.globalDiscount,
    ...doc.plan.rows.map((r) => r.amount),
  ].some((v) => !/\.00$/.test(Number(v).toFixed(2)));
  const m = (v: string) => `<span class="num">${esc(formatMoney(v, cur, { decimals: hasCents }))}</span>`;
  const b = doc.brand;
  const forWhom = doc.contact ? `${esc(doc.client.name)}<span class="muted"> · Atención: ${esc(doc.contact.name)}</span>` : esc(doc.client.name);
  const h2 = sectionCounter();

  const rows = doc.items
    .map((it, i) => {
      const disc =
        it.discountType === "percent" && Number(it.discountValue) > 0
          ? `−${fmtPct(it.discountValue)}`
          : it.discountType === "amount" && Number(it.discount) > 0
            ? `−${esc(formatMoney(it.discount, cur, { decimals: hasCents }))}`
            : "—";
      return `<tr>
        <td class="n num">${String(i + 1).padStart(2, "0")}</td>
        <td class="desc">${esc(it.description)}</td>
        <td class="qty r num">${esc(unitText(it.quantity, it.unit))}</td>
        <td class="price r">${m(it.unitPrice)}</td>
        <td class="disc r num">${disc}</td>
        <td class="total r">${m(it.lineTotal)}</td>
      </tr>`;
    })
    .join("");

  const t = doc.totals;
  const globalLbl = t.globalDiscountType === "percent" ? `Descuento global (${fmtPct(t.globalDiscountValue)})` : "Descuento global";
  const totalsHtml = `<div class="totals"><table>
    <tr><td class="muted">Subtotal</td><td class="r">${m(t.subtotal)}</td></tr>
    ${Number(t.itemsDiscount) > 0 ? `<tr><td class="muted">Descuentos por ítem</td><td class="r">−${m(t.itemsDiscount)}</td></tr>` : ""}
    ${Number(t.globalDiscount) > 0 ? `<tr><td class="muted">${globalLbl}</td><td class="r">−${m(t.globalDiscount)}</td></tr>` : ""}
    <tr class="grand"><td class="lbl">Total</td><td class="r">${m(t.total)}</td></tr>
    <tr class="fine"><td colspan="2"><span class="tag">Precios finales</span>${doc.exchangeRateRef ? ` Tipo de cambio de referencia: $ ${esc(new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(Number(doc.exchangeRateRef)))} por US$ 1.` : ""}</td></tr>
  </table></div>`;

  let planHtml = "";
  if (doc.plan.kind === "monthly") {
    planHtml = `<p><strong>Abono mensual de ${m(doc.plan.monthlyAmount ?? "0")}</strong> ${doc.plan.months ? `durante ${doc.plan.months} ${doc.plan.months === 1 ? "mes" : "meses"}` : "por tiempo indeterminado"}, con vencimiento mensual a partir de la aceptación.</p>`;
  } else {
    planHtml = `<table class="t plan"><thead><tr><th>Concepto</th><th class="r">%</th><th>Vencimiento</th><th class="r">Importe</th></tr></thead><tbody>${doc.plan.rows
      .map(
        (r) =>
          `<tr><td>${esc(r.label)}</td><td class="r num">${r.percent !== null ? fmtPct(r.percent) : "—"}</td><td>${whenText(r.offsetDays)}</td><td class="r">${m(r.amount)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
  }

  const validDays = Math.round((Date.parse(doc.validUntil) - Date.parse(doc.issueDate)) / 86_400_000);
  const section = (title: string, md: string | null) =>
    md?.trim() ? `<section class="block">${h2(title)}<div class="md">${mdToHtml(md)}</div></section>` : "";

  const intro = mdToHtml(doc.introMd);
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(doc.number)} · ${esc(doc.title)}</title>
<style>${opts.fontCss ?? ""}${PAPER_CSS}${CSS}</style></head><body${opts.preview ? ' class="preview"' : ""}>
<section class="sheet cover">
  ${letterhead(b, { large: true, sub: "Propuesta comercial" })}
  <div class="hero">
    <div class="rule"></div>
    <div class="eyebrow">Presupuesto ${esc(doc.number)}${doc.version > 1 ? ` · versión ${doc.version}` : ""}</div>
    <h1>${esc(doc.title)}</h1>
    <div class="for">Preparado para <strong>${forWhom}</strong>${doc.client.legalName && doc.client.legalName !== doc.client.name ? `<br><span class="muted">${esc(doc.client.legalName)}${doc.client.taxId ? ` · CUIT ${esc(doc.client.taxId)}` : ""}</span>` : ""}</div>
    <div class="facts" style="--cols:4">
      <div><div class="k">Fecha</div><div class="v num">${formatDate(doc.issueDate)}</div></div>
      <div><div class="k">Válido hasta</div><div class="v num">${formatDate(doc.validUntil)}</div></div>
      <div><div class="k">Moneda</div><div class="v">${cur === "USD" ? "Dólares (US$)" : "Pesos ($)"}</div></div>
      <div class="hl"><div class="k">Total</div><div class="v big" data-total>${m(t.total)}</div></div>
    </div>
    ${intro ? `<div class="intro md">${intro}</div>` : ""}
  </div>
  <div class="foot"><span>Precios finales · documento no válido como factura</span><span class="num">${esc(doc.number)}</span></div>
</section>
<section class="sheet">
  <section class="block">${h2("Resumen")}
    <div class="cols">
      <dl class="sum"><dt>Cliente</dt><dd>${esc(doc.client.name)}</dd><dt>Proyecto</dt><dd>${esc(doc.title)}</dd><dt>Ítems</dt><dd class="num">${doc.items.length}</dd></dl>
      <dl class="sum"><dt>Total</dt><dd>${m(t.total)} <span class="muted">(precios finales)</span></dd><dt>Plan de cobro</dt><dd>${esc(label(L.paymentPlanKind, doc.plan.kind))}</dd><dt>Validez</dt><dd>hasta el <span class="num">${formatDate(doc.validUntil)}</span></dd></dl>
    </div>
  </section>
  ${section("Alcance", doc.scopeMd)}
  ${section("Exclusiones", doc.exclusionsMd)}
  <section class="block">${h2("Detalle")}
    <table class="t items"><thead><tr><th class="n">#</th><th>Descripción</th><th class="r">Cantidad</th><th class="r">Precio unit.</th><th class="r">Desc.</th><th class="r">Importe</th></tr></thead><tbody>${rows}</tbody></table>
    ${totalsHtml}
  </section>
  <section class="block">${h2("Plan de cobro")}${planHtml}</section>
  ${section("Condiciones", doc.termsMd)}
  ${section("Notas", doc.notesMd)}
  <section class="block">${h2("Validez")}
    <div class="validity"><span>Esta propuesta es válida hasta el <strong class="num">${formatDate(doc.validUntil)}</strong>${validDays > 0 ? ` (${validDays} días desde su emisión)` : ""}.</span><span class="muted num">${esc(doc.number)}${doc.version > 1 ? ` · v${doc.version}` : ""}</span></div>
  </section>
  <section class="block">${h2("Aceptación")}
    <div class="accept">
      <p>Para aceptar la propuesta, respondé por ${b.phone ? "WhatsApp o " : ""}email confirmando, o firmá y enviá esta página. Al aceptar se coordina el inicio y el primer pago según el plan de cobro.</p>
      <div class="sign"><div>Firma</div><div>Aclaración</div><div>Fecha</div></div>
    </div>
  </section>
</section>
</body></html>`;
}

/** Encabezado y pie de página de Chromium (se repiten en cada página del PDF). */
export function pdfHeaderFooter(doc: Pick<QuoteDoc, "brand" | "number" | "version" | "issueDate">, fontCss = "") {
  return pageChrome({
    brand: doc.brand,
    fontCss,
    right: `Presupuesto ${esc(doc.number)}${doc.version > 1 ? ` · v${doc.version}` : ""}`,
    footerLeft: `${esc(doc.brand.name)} · ${formatDate(doc.issueDate)}`,
  });
}
