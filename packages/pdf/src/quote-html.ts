/**
 * Plantilla HTML del presupuesto (la misma para el PDF y para la vista previa en vivo).
 * Pura: sin Node ni navegador. Pensada para imprimirse en blanco y negro: el color nunca
 * es la única forma de transmitir información (docs/07 §5).
 */
import { formatDate, formatMoney, L, label } from "@agencyos/core";
import { marked } from "marked";

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
  /** CSS con el @font-face de Geist (data URL para el PDF, URL para la vista previa). */
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
:root { --ink:#111114; --muted:#55565e; --faint:#8a8b93; --rule:#d9d9de; --soft:#f4f4f6; --accent:#7C5CFF; }
* { box-sizing:border-box; }
html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { margin:0; color:var(--ink); font-family:"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size:10.5pt; line-height:1.5; font-feature-settings:"tnum" 1, "ss01" 1; }
.num { font-variant-numeric:tabular-nums; white-space:nowrap; }
h1,h2,h3 { margin:0; font-weight:600; letter-spacing:-0.015em; }
h2 { font-size:13pt; margin:0 0 8px; display:flex; align-items:baseline; gap:10px; }
h2 .idx { font-size:9pt; color:var(--faint); font-weight:500; letter-spacing:0.08em; }
p { margin:0 0 6px; }
.eyebrow { font-size:8pt; letter-spacing:0.18em; text-transform:uppercase; color:var(--muted); font-weight:500; }
.mono { display:inline-grid; place-items:center; width:34px; height:34px; border:1px solid var(--ink); border-radius:9px; font-weight:600; font-size:12pt; letter-spacing:-0.04em; line-height:1; flex:none; }
.mono.lg { width:56px; height:56px; border-radius:14px; font-size:19pt; border-width:1.25px; }
.brand { display:flex; align-items:center; gap:12px; }
.brand-name { font-weight:600; font-size:12pt; letter-spacing:-0.01em; }
.brand-meta { color:var(--muted); font-size:9pt; }
.rule { height:2px; width:44px; background:var(--accent); border-radius:2px; margin:0 0 14px; }

.cover { display:flex; flex-direction:column; min-height:calc(297mm - 36mm - 16mm); }
.cover .top { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; padding-bottom:18px; border-bottom:1px solid var(--rule); }
.cover .contact { text-align:right; font-size:9pt; color:var(--muted); line-height:1.6; }
.cover .hero { margin-top:56px; }
.cover h1 { font-size:28pt; line-height:1.12; margin:10px 0 14px; max-width:15cm; }
.cover .for { font-size:12pt; color:var(--muted); }
.cover .for strong { color:var(--ink); font-weight:600; }
.facts { display:grid; grid-template-columns:repeat(4, 1fr); border:1px solid var(--ink); border-radius:10px; margin-top:36px; overflow:hidden; }
.facts > div { padding:12px 14px; border-left:1px solid var(--rule); }
.facts > div:first-child { border-left:0; }
.facts .k { font-size:7.5pt; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted); }
.facts .v { font-size:11pt; font-weight:500; margin-top:3px; }
.facts .total .v { font-size:14pt; font-weight:700; }
.cover .intro { margin-top:32px; max-width:15.5cm; font-size:11pt; color:#26272d; }
.cover .foot { margin-top:auto; padding-top:20px; border-top:1px solid var(--rule); display:flex; justify-content:space-between; gap:12px; font-size:8.5pt; color:var(--muted); }

section.block { margin:0 0 22px; break-inside:auto; }
.md { color:#26272d; }
.md ul, .md ol { margin:4px 0 8px; padding-left:18px; }
.md li { margin:2px 0; }
.md strong { color:var(--ink); }
.md p:last-child { margin-bottom:0; }
.cols { display:grid; grid-template-columns:1fr 1fr; gap:24px; }

table.items { width:100%; border-collapse:collapse; font-size:9.5pt; }
table.items th { text-align:left; font-size:7.5pt; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); font-weight:500; padding:0 8px 7px; border-bottom:1.5px solid var(--ink); }
table.items td { padding:9px 8px; border-bottom:1px solid var(--rule); vertical-align:top; }
table.items tr { break-inside:avoid; }
table.items .r { text-align:right; }
table.items .n { color:var(--faint); width:22px; padding-left:0; }
table.items .desc { font-weight:500; }
table.items .sub { color:var(--muted); font-size:8.5pt; font-weight:400; }

.totals { margin-top:14px; display:flex; justify-content:flex-end; break-inside:avoid; }
.totals table { border-collapse:collapse; min-width:8.5cm; font-size:10pt; }
.totals td { padding:5px 0; }
.totals td.r { text-align:right; padding-left:24px; }
.totals .grand td { border-top:1.5px solid var(--ink); padding-top:10px; font-size:15pt; font-weight:700; }
.totals .grand .lbl { font-size:10pt; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; }
.totals .note td { font-size:8.5pt; color:var(--muted); padding-top:2px; }
.final { display:inline-block; border:1px solid var(--ink); border-radius:6px; padding:1px 7px; font-size:8pt; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; }

table.plan { width:100%; border-collapse:collapse; font-size:9.5pt; break-inside:avoid; }
table.plan td, table.plan th { padding:8px; border-bottom:1px solid var(--rule); text-align:left; }
table.plan th { font-size:7.5pt; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); font-weight:500; border-bottom:1.5px solid var(--ink); }
table.plan .r { text-align:right; }

.validity { border:1px dashed var(--ink); border-radius:10px; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; gap:16px; break-inside:avoid; }
.accept { border:1px solid var(--ink); border-radius:12px; padding:16px 18px; break-inside:avoid; }
.accept .lines { display:grid; grid-template-columns:repeat(3, 1fr); gap:22px; margin-top:34px; }
.accept .lines div { border-top:1px solid var(--ink); padding-top:5px; font-size:8pt; color:var(--muted); letter-spacing:0.12em; text-transform:uppercase; }
.muted { color:var(--muted); }

@page { size:A4; margin:18mm; }
@media print {
  .sheet.cover { break-after:page; }
}
@media screen {
  html { background:#e7e7ec; }
  body { padding:24px 12px; }
  .sheet { background:#fff; width:100%; max-width:210mm; margin:0 auto 20px; padding:18mm; border-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,.08), 0 10px 30px -10px rgba(0,0,0,.25); }
  .cover { min-height:calc(297mm - 36mm); }
}
@media screen and (max-width:640px) {
  body { padding:10px 8px; font-size:10pt; }
  .sheet { padding:20px 16px; }
  .cover { min-height:0; }
  .cover .top { flex-direction:column; gap:10px; }
  .cover .contact { text-align:left; }
  .cover .hero { margin-top:28px; }
  .cover h1 { font-size:21pt; }
  .facts { grid-template-columns:1fr 1fr; }
  .facts > div:nth-child(3) { border-left:0; }
  .facts > div:nth-child(n+3) { border-top:1px solid var(--rule); }
  .cols { grid-template-columns:1fr; gap:14px; }
  table.items thead { display:none; }
  table.items, table.items tbody, table.items tr, table.items td { display:block; width:100%; }
  table.items tr { border-bottom:1px solid var(--rule); padding:8px 0; display:grid; grid-template-columns:1fr auto; gap:2px 12px; }
  table.items td { border:0; padding:0; text-align:left !important; }
  table.items td.n { display:none; }
  table.items td.desc { grid-column:1 / -1; }
  table.items td.qty, table.items td.price, table.items td.disc { font-size:8.5pt; color:var(--muted); grid-column:1; }
  table.items td.total { grid-column:2; grid-row:2 / span 3; align-self:center; font-weight:600; }
  .totals table { min-width:0; width:100%; }
  .accept .lines { grid-template-columns:1fr; gap:26px; }
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
  const contactLines = [b.email, b.phone ? `WhatsApp ${b.phone}` : null, b.website, b.city].filter(Boolean) as string[];
  const forWhom = doc.contact ? `${esc(doc.client.name)}<span class="muted"> · Atención: ${esc(doc.contact.name)}</span>` : esc(doc.client.name);
  let idx = 0;
  const h2 = (t: string) => `<h2><span class="idx">${String(++idx).padStart(2, "0")}</span>${esc(t)}</h2>`;

  const rows = doc.items
    .map((it, i) => {
      const disc =
        it.discountType === "percent" && Number(it.discountValue) > 0
          ? `−${fmtPct(it.discountValue)}`
          : it.discountType === "amount" && Number(it.discount) > 0
            ? `−${esc(formatMoney(it.discount, cur, { decimals: hasCents }))}`
            : "—";
      return `<tr>
        <td class="n num">${i + 1}</td>
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
    <tr><td>Subtotal</td><td class="r">${m(t.subtotal)}</td></tr>
    ${Number(t.itemsDiscount) > 0 ? `<tr><td>Descuentos por ítem</td><td class="r">−${m(t.itemsDiscount)}</td></tr>` : ""}
    ${Number(t.globalDiscount) > 0 ? `<tr><td>${globalLbl}</td><td class="r">−${m(t.globalDiscount)}</td></tr>` : ""}
    <tr class="grand"><td class="lbl">Total</td><td class="r">${m(t.total)}</td></tr>
    <tr class="note"><td colspan="2"><span class="final">Precios finales</span>${doc.exchangeRateRef ? ` Tipo de cambio de referencia: $ ${esc(new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(Number(doc.exchangeRateRef)))} por US$ 1.` : ""}</td></tr>
  </table></div>`;

  let planHtml = "";
  if (doc.plan.kind === "monthly") {
    planHtml = `<p><strong>Abono mensual de ${m(doc.plan.monthlyAmount ?? "0")}</strong> ${doc.plan.months ? `durante ${doc.plan.months} ${doc.plan.months === 1 ? "mes" : "meses"}` : "por tiempo indeterminado"}, con vencimiento mensual a partir de la aceptación.</p>`;
  } else {
    planHtml = `<table class="plan"><thead><tr><th>Concepto</th><th class="r">%</th><th>Vencimiento</th><th class="r">Importe</th></tr></thead><tbody>${doc.plan.rows
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
<style>${opts.fontCss ?? ""}${CSS}</style></head><body${opts.preview ? ' class="preview"' : ""}>
<section class="sheet cover">
  <div class="top">
    <div class="brand"><span class="mono lg" aria-hidden="true">${esc(b.initials)}</span><div class="brand-name">${esc(b.name)}</div></div>
    <div class="contact">${contactLines.map(esc).join("<br>")}</div>
  </div>
  <div class="hero">
    <div class="rule"></div>
    <div class="eyebrow">Presupuesto · ${esc(doc.number)}${doc.version > 1 ? ` · versión ${doc.version}` : ""}</div>
    <h1>${esc(doc.title)}</h1>
    <div class="for">Para <strong>${forWhom}</strong>${doc.client.legalName && doc.client.legalName !== doc.client.name ? `<br><span class="muted">${esc(doc.client.legalName)}${doc.client.taxId ? ` · CUIT ${esc(doc.client.taxId)}` : ""}</span>` : ""}</div>
    <div class="facts">
      <div><div class="k">Fecha</div><div class="v num">${formatDate(doc.issueDate)}</div></div>
      <div><div class="k">Válido hasta</div><div class="v num">${formatDate(doc.validUntil)}</div></div>
      <div><div class="k">Moneda</div><div class="v">${cur === "USD" ? "Dólares (US$)" : "Pesos ($)"}</div></div>
      <div class="total"><div class="k">Total</div><div class="v" data-total>${m(t.total)}</div></div>
    </div>
    ${intro ? `<div class="intro md">${intro}</div>` : ""}
  </div>
  <div class="foot"><span>Precios finales · documento no válido como factura</span><span class="num">${esc(doc.number)}</span></div>
</section>
<section class="sheet">
  <section class="block">${h2("Resumen")}
    <div class="cols md">
      <div><p><strong>Cliente:</strong> ${esc(doc.client.name)}</p><p><strong>Proyecto:</strong> ${esc(doc.title)}</p><p><strong>Ítems:</strong> ${doc.items.length}</p></div>
      <div><p><strong>Total:</strong> ${m(t.total)} <span class="muted">(precios finales)</span></p><p><strong>Plan de cobro:</strong> ${esc(label(L.paymentPlanKind, doc.plan.kind))}</p><p><strong>Validez:</strong> hasta el ${formatDate(doc.validUntil)}</p></div>
    </div>
  </section>
  ${section("Alcance", doc.scopeMd)}
  ${section("Exclusiones", doc.exclusionsMd)}
  <section class="block">${h2("Detalle")}
    <table class="items"><thead><tr><th class="n">#</th><th>Descripción</th><th class="r">Cantidad</th><th class="r">Precio unit.</th><th class="r">Desc.</th><th class="r">Importe</th></tr></thead><tbody>${rows}</tbody></table>
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
      <div class="lines"><div>Firma</div><div>Aclaración</div><div>Fecha</div></div>
    </div>
  </section>
</section>
</body></html>`;
}

/** Encabezado y pie de página de Chromium (se repiten en cada página del PDF). */
export function pdfHeaderFooter(doc: Pick<QuoteDoc, "brand" | "number" | "version" | "issueDate">, fontCss = "") {
  const base = `${fontCss}<style>*{font-family:"Geist",ui-sans-serif,system-ui,sans-serif;-webkit-print-color-adjust:exact;}</style>`;
  const header = `${base}<div style="width:100%;padding:0 18mm;display:flex;align-items:center;justify-content:space-between;font-size:7.5pt;color:#55565e;">
    <span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border:0.8px solid #111114;border-radius:4px;font-size:6pt;font-weight:600;color:#111114;letter-spacing:-0.04em;">${esc(doc.brand.initials)}</span><span style="color:#111114;font-weight:600;">${esc(doc.brand.name)}</span></span>
    <span>${esc(doc.number)}${doc.version > 1 ? ` · v${doc.version}` : ""}</span></div>`;
  const footer = `${base}<div style="width:100%;padding:0 18mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#55565e;">
    <span>${esc(doc.brand.name)} · ${formatDate(doc.issueDate)}</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
  return { header, footer };
}
