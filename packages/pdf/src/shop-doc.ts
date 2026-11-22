/**
 * Comprobante de venta y remito del comercio (SaaS, ADR 0016): A4 con la papelería común, en el formato que
 * conoce cualquier comercio argentino (recuadro «X», punto de venta y número), siempre aclarando que no es
 * una factura. El remito puede ir con o sin precios. Plantilla pura (sin Node ni navegador).
 */
import { formatMoney } from "@agencyos/core";
import { docFontCss } from "./fonts";
import { esc, PAPER_CSS, pageChrome, SANS, SERIF } from "./paper";
import { htmlToPdf } from "./render";

export type ShopDoc = {
  kind: "sale" | "remito";
  shop: { name: string; address: string | null; phone: string | null; taxId: string | null; footer: string | null };
  currency: string;
  number: number;
  /** Fecha y hora ya formateadas (dd/mm/aaaa hh:mm). */
  issuedAt: string;
  customer: { name: string; doc: string | null; phone: string | null; email: string | null } | null;
  items: { name: string; qty: number; unitPrice: string; lineTotal: string }[];
  subtotal: string;
  discount: string;
  total: string;
  showPrices: boolean;
  paymentLabel: string | null;
  cancelled: boolean;
  delivery: { date: string | null; channel: string; status: string; notes: string | null } | null;
  sellerName: string;
};

const CSS = `
.head { display:grid; grid-template-columns:1fr auto 1fr; align-items:stretch; border:0.75pt solid var(--ink); border-radius:4px; }
.head > div { padding:14px 16px; }
.head .shop { border-right:0.5pt solid var(--rule); }
.head .shop .name { font-family:var(--serif); font-weight:600; font-size:16pt; line-height:1.15; margin-bottom:6px; }
.head .shop p { margin:0; font-size:8.5pt; color:var(--muted); line-height:1.6; }
.head .letter { display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding:0 12px 10px; margin-top:-0.75pt; }
.head .letter b { display:grid; place-items:center; width:46px; height:46px; border:0.75pt solid var(--ink); border-top:0; background:#fff; font-family:var(--serif); font-size:24pt; font-weight:600; line-height:1; }
.head .letter span { margin-top:6px; max-width:90px; text-align:center; font-size:6pt; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); font-weight:600; line-height:1.35; }
.head .doc { border-left:0.5pt solid var(--rule); text-align:right; }
.head .doc .type { font-family:var(--serif); font-size:15pt; font-weight:600; color:var(--accent); line-height:1.15; }
.head .doc .nr { font-size:11pt; font-weight:600; margin-top:4px; }
.head .doc dl { margin:8px 0 0; display:grid; grid-template-columns:1fr auto; gap:2px 10px; font-size:8.5pt; }
.head .doc dt { color:var(--muted); }
.head .doc dd { margin:0; }
.party { margin-top:12px; border:0.5pt solid var(--rule); border-radius:4px; padding:10px 16px; display:grid; grid-template-columns:repeat(var(--cols, 3), 1fr); gap:8px 18px; break-inside:avoid; }
.party .k { font-size:7pt; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); font-weight:600; }
.party .v { font-size:9.5pt; font-weight:500; margin-top:1px; }
.party .wide { grid-column:1 / -1; }
table.t.items { margin-top:18px; font-size:9.5pt; }
table.t.items td { padding:8px 8px; }
table.t.items td.q { width:70px; font-weight:600; }
.totals { margin-top:12px; display:flex; justify-content:flex-end; break-inside:avoid; }
.totals table { border-collapse:collapse; min-width:7.5cm; font-size:10pt; }
.totals td { padding:3px 0; }
.totals td.r { text-align:right; padding-left:28px; }
.totals .grand td { border-top:2.2pt double var(--ink); padding-top:9px; }
.totals .grand .lbl { font-size:7.5pt; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; vertical-align:middle; }
.totals .grand .r { font-family:var(--serif); font-size:18pt; font-weight:600; color:var(--accent); }
.count { margin-top:10px; font-size:9pt; color:var(--muted); }
.received { margin-top:34px; border:0.6pt solid var(--ink); border-radius:4px; padding:14px 16px; break-inside:avoid; }
.received .sign { grid-template-columns:repeat(4, 1fr); margin-top:40px; }
.thanks { margin-top:28px; text-align:center; font-family:var(--serif); font-size:12pt; font-style:italic; color:var(--muted); }
.legal { margin-top:22px; padding-top:8px; border-top:0.5pt solid var(--rule); display:flex; justify-content:space-between; gap:16px; font-size:7.5pt; color:var(--muted); }
.void { position:fixed; top:42%; left:0; right:0; text-align:center; transform:rotate(-18deg); font-family:var(--serif); font-size:68pt; font-weight:700; letter-spacing:0.12em; color:rgba(168,50,31,.16); pointer-events:none; }
`;

/** Punto de venta y número en el formato habitual: 0001-00000042. */
export const docNumber = (n: number) => `0001-${String(n).padStart(8, "0")}`;

export function renderShopDocHtml(doc: ShopDoc, opts: { fontCss?: string } = {}): string {
  const money = (v: string) => `<span class="num">${esc(formatMoney(v, doc.currency))}</span>`;
  const isSale = doc.kind === "sale";
  const type = isSale ? "Comprobante de venta" : "Remito";
  const shopLines = [doc.shop.address, doc.shop.phone ? `Tel. ${doc.shop.phone}` : null, doc.shop.taxId ? `CUIT ${doc.shop.taxId}` : null].filter(
    Boolean,
  ) as string[];
  const c = doc.customer;
  const party = [
    `<div><div class="k">${isSale ? "Cliente" : "Destinatario"}</div><div class="v">${esc(c?.name ?? "Consumidor final")}</div></div>`,
    `<div><div class="k">CUIT / DNI</div><div class="v num">${esc(c?.doc ?? "—")}</div></div>`,
    `<div><div class="k">Teléfono</div><div class="v num">${esc(c?.phone ?? "—")}</div></div>`,
    ...(doc.delivery
      ? [
          `<div><div class="k">Entrega</div><div class="v num">${esc(doc.delivery.date ?? "A coordinar")}</div></div>`,
          `<div><div class="k">Canal</div><div class="v">${esc(doc.delivery.channel)}</div></div>`,
          `<div><div class="k">Estado</div><div class="v">${esc(doc.delivery.status)}</div></div>`,
          ...(doc.delivery.notes ? [`<div class="wide"><div class="k">Observaciones</div><div class="v">${esc(doc.delivery.notes)}</div></div>`] : []),
        ]
      : [
          `<div><div class="k">Forma de pago</div><div class="v">${esc(doc.paymentLabel ?? "—")}</div></div>`,
          `<div><div class="k">Atendió</div><div class="v">${esc(doc.sellerName)}</div></div>`,
          ...(c?.email ? [`<div><div class="k">Email</div><div class="v">${esc(c.email)}</div></div>`] : []),
        ]),
  ].join("");
  const units = doc.items.reduce((a, i) => a + i.qty, 0);
  const head = doc.showPrices
    ? '<tr><th>Cant.</th><th>Descripción</th><th class="r">Precio unit.</th><th class="r">Importe</th></tr>'
    : "<tr><th>Cant.</th><th>Descripción</th></tr>";
  const rows = doc.items
    .map((i) =>
      doc.showPrices
        ? `<tr><td class="q num">${i.qty}</td><td>${esc(i.name)}</td><td class="r">${money(i.unitPrice)}</td><td class="r">${money(i.lineTotal)}</td></tr>`
        : `<tr><td class="q num">${i.qty}</td><td>${esc(i.name)}</td></tr>`,
    )
    .join("");
  const totals = doc.showPrices
    ? `<div class="totals"><table>
    ${Number(doc.discount) > 0 ? `<tr><td class="muted">Subtotal</td><td class="r">${money(doc.subtotal)}</td></tr><tr><td class="muted">Descuento</td><td class="r">−${money(doc.discount)}</td></tr>` : ""}
    <tr class="grand"><td class="lbl">Total</td><td class="r" data-total>${money(doc.total)}</td></tr>
  </table></div>`
    : "";
  const closing = isSale
    ? `<p class="thanks">${esc(doc.shop.footer || "¡Gracias por tu compra!")}</p>`
    : `<div class="received"><p class="label" style="margin:0">Recibí conforme la mercadería detallada</p><div class="sign"><div>Firma</div><div>Aclaración</div><div>DNI</div><div>Fecha</div></div></div>${doc.shop.footer ? `<p class="thanks">${esc(doc.shop.footer)}</p>` : ""}`;

  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${type} ${docNumber(doc.number)} · ${esc(doc.shop.name)}</title>
<style>${opts.fontCss ?? ""}${PAPER_CSS}${CSS}</style></head><body>
${doc.cancelled ? `<div class="void" aria-hidden="true">${isSale ? "ANULADA" : "CANCELADO"}</div>` : ""}
<header class="head">
  <div class="shop"><div class="name">${esc(doc.shop.name)}</div>${shopLines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>
  <div class="letter"><b>X</b><span>Documento no válido como factura</span></div>
  <div class="doc">
    <div class="type">${type}</div>
    <div class="nr num">N.º ${docNumber(doc.number)}</div>
    <dl><dt>Fecha</dt><dd class="num">${esc(doc.issuedAt)}</dd>${doc.cancelled ? `<dt>Estado</dt><dd>${isSale ? "Anulada" : "Cancelado"}</dd>` : ""}</dl>
  </div>
</header>
<section class="party" style="--cols:3">${party}</section>
<table class="t items"><thead>${head}</thead><tbody>${rows}</tbody></table>
<p class="count num">${doc.items.length} ${doc.items.length === 1 ? "artículo" : "artículos"} · ${units} ${units === 1 ? "unidad" : "unidades"}</p>
${totals}
${closing}
<p class="legal"><span>${esc(doc.shop.name)} · ${type.toLowerCase()} ${docNumber(doc.number)}</span><span>Documento no válido como factura</span></p>
</body></html>`;
}

export async function renderShopDocPdf(doc: ShopDoc): Promise<Buffer> {
  const fontCss = docFontCss();
  const html = renderShopDocHtml(doc, { fontCss });
  const initials =
    doc.shop.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "·";
  const type = doc.kind === "sale" ? "Comprobante de venta" : "Remito";
  const { header, footer } = pageChrome({
    brand: { name: doc.shop.name, initials },
    fontCss,
    right: `${type} ${docNumber(doc.number)}`,
    footerLeft: `${esc(doc.shop.name)} · ${esc(doc.issuedAt)}`,
  });
  return htmlToPdf(html, { headerTemplate: header, footerTemplate: footer });
}

// ---------- Ticket para impresora térmica (80 o 58 mm) ----------

export type TicketWidth = 80 | 58;

const TICKET_CSS = `
@page { margin:0; }
* { box-sizing:border-box; }
html, body { margin:0; background:#fff; color:#000; }
body { font-family:var(--sans); font-size:var(--fs); line-height:1.4; padding:4mm var(--pad) 6mm; font-variant-numeric:tabular-nums lining-nums; -webkit-print-color-adjust:exact; }
.c { text-align:center; }
.name { font-family:var(--serif); font-weight:700; font-size:calc(var(--fs) * 1.6); line-height:1.15; margin-bottom:2px; }
.small { font-size:calc(var(--fs) * 0.86); }
.sep { border:0; border-top:1px dashed #000; margin:6px 0; }
.type { font-weight:700; letter-spacing:0.06em; text-transform:uppercase; margin-top:2px; }
.row { display:flex; justify-content:space-between; gap:8px; }
.row span:last-child { text-align:right; white-space:nowrap; }
.item { margin:3px 0; }
.item .d { word-break:break-word; }
.item .q { color:#222; }
.total { font-family:var(--serif); font-weight:700; font-size:calc(var(--fs) * 1.55); margin-top:2px; }
.void { border:1.5px solid #000; text-align:center; font-weight:700; letter-spacing:0.2em; padding:2px 0; margin:6px 0; }
.sign { margin-top:22px; border-top:1px solid #000; padding-top:2px; text-align:center; }
`;

/** Ticket angosto: mismo contenido que el comprobante, apilado para una impresora térmica. */
export function renderShopTicketHtml(doc: ShopDoc, width: TicketWidth, opts: { fontCss?: string } = {}): string {
  const money = (v: string) => esc(formatMoney(v, doc.currency));
  const isSale = doc.kind === "sale";
  const type = isSale ? "Comprobante de venta" : "Remito";
  const c = doc.customer;
  const vars = width === 58 ? "--fs:8pt;--pad:2.5mm" : "--fs:9pt;--pad:4mm";
  const items = doc.items
    .map((i) =>
      doc.showPrices
        ? `<div class="item"><div class="d">${esc(i.name)}</div><div class="row q"><span>${i.qty} × ${money(i.unitPrice)}</span><span>${money(i.lineTotal)}</span></div></div>`
        : `<div class="item row"><span class="d">${esc(i.name)}</span><span>× ${i.qty}</span></div>`,
    )
    .join("");
  const units = doc.items.reduce((a, i) => a + i.qty, 0);
  const shopLines = [doc.shop.address, doc.shop.phone ? `Tel. ${doc.shop.phone}` : null, doc.shop.taxId ? `CUIT ${doc.shop.taxId}` : null].filter(
    Boolean,
  ) as string[];
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>${type} ${docNumber(doc.number)}</title>
<style>${opts.fontCss ?? ""}:root{--sans:${SANS};--serif:${SERIF};${vars}}${TICKET_CSS}</style></head><body>
<div class="c"><div class="name">${esc(doc.shop.name)}</div>${shopLines.map((l) => `<div class="small">${esc(l)}</div>`).join("")}</div>
<hr class="sep">
<div class="c"><div class="type">${type}</div><div>N.º ${docNumber(doc.number)}</div><div class="small">${esc(doc.issuedAt)}</div><div class="small">Documento no válido como factura</div></div>
${doc.cancelled ? `<div class="void">${isSale ? "ANULADA" : "CANCELADO"}</div>` : ""}
<hr class="sep">
<div class="small">${isSale ? "Cliente" : "Para"}: ${esc(c?.name ?? "Consumidor final")}${c?.doc ? ` · ${esc(c.doc)}` : ""}</div>
${doc.delivery ? `<div class="small">Entrega: ${esc(doc.delivery.date ?? "a coordinar")} · ${esc(doc.delivery.channel)}</div>${doc.delivery.notes ? `<div class="small">Obs.: ${esc(doc.delivery.notes)}</div>` : ""}` : ""}
<hr class="sep">
${items}
<hr class="sep">
<div class="row small"><span>${doc.items.length} ${doc.items.length === 1 ? "artículo" : "artículos"}</span><span>${units} ${units === 1 ? "unidad" : "unidades"}</span></div>
${
  doc.showPrices
    ? `${Number(doc.discount) > 0 ? `<div class="row"><span>Subtotal</span><span>${money(doc.subtotal)}</span></div><div class="row"><span>Descuento</span><span>−${money(doc.discount)}</span></div>` : ""}
<div class="row total"><span>TOTAL</span><span data-total>${money(doc.total)}</span></div>
${doc.paymentLabel ? `<div class="row small"><span>Pago</span><span>${esc(doc.paymentLabel)}</span></div>` : ""}`
    : ""
}
${isSale ? "" : '<div class="sign small">Recibí conforme · firma y aclaración</div>'}
<hr class="sep">
<div class="c small">${esc(doc.shop.footer || (isSale ? "¡Gracias por tu compra!" : ""))}</div>
</body></html>`;
}

export async function renderShopTicketPdf(doc: ShopDoc, width: TicketWidth): Promise<Buffer> {
  return htmlToPdf(renderShopTicketHtml(doc, width, { fontCss: docFontCss() }), { rollWidthMm: width });
}

// ---------- Cierre de caja ----------

export type CashCloseDoc = {
  shopName: string;
  currency: string;
  /** Día ya formateado (dd/mm/aaaa) y hora de impresión. */
  dayLabel: string;
  printedAt: string;
  count: number;
  total: string;
  discount: string;
  cash: string;
  nonCash: string;
  /** Vendido a cuenta (fiado) en el día y cobros de cuentas corrientes. */
  onAccount?: string;
  collections?: { label: string; count: number; total: string }[];
  collected?: string;
  cancelled: { count: number; total: string };
  units: number;
  payments: { label: string; count: number; total: string }[];
  items: { name: string; qty: number; total: string }[];
  sellers: { name: string; count: number; total: string }[];
};

const CASH_A4_CSS = `
.hero { margin:32px 0 0; }
.hero .rule { height:2pt; width:46px; background:var(--accent); margin:0 0 14px; }
.cols { display:grid; grid-template-columns:1fr 1fr; gap:28px; }
.count-box { margin-top:28px; border:0.6pt solid var(--ink); border-radius:4px; padding:14px 16px; break-inside:avoid; }
.count-box .sign { grid-template-columns:repeat(3, 1fr); margin-top:34px; }
`;

/** Cierre de caja: hoja A4 o ticket térmico (mismo contenido). */
export function renderCashCloseHtml(doc: CashCloseDoc, format: "a4" | TicketWidth, opts: { fontCss?: string } = {}): string {
  const m = (v: string) => esc(formatMoney(v, doc.currency));
  if (format === "a4") {
    const pay = doc.payments.length
      ? `<table class="t"><thead><tr><th>Medio de pago</th><th class="r">Ventas</th><th class="r">Total</th></tr></thead><tbody>${doc.payments
          .map((p) => `<tr><td>${esc(p.label)}</td><td class="r num">${p.count}</td><td class="r num">${m(p.total)}</td></tr>`)
          .join("")}<tr class="total"><td>Total</td><td class="r num">${doc.count}</td><td class="r num">${m(doc.total)}</td></tr></tbody></table>`
      : '<p class="muted">Sin ventas en el día.</p>';
    const sellers = doc.sellers.length
      ? `<table class="t"><thead><tr><th>Vendedor</th><th class="r">Ventas</th><th class="r">Total</th></tr></thead><tbody>${doc.sellers
          .map((s) => `<tr><td>${esc(s.name)}</td><td class="r num">${s.count}</td><td class="r num">${m(s.total)}</td></tr>`)
          .join("")}</tbody></table>`
      : '<p class="muted">—</p>';
    const items = doc.items.length
      ? `<table class="t"><thead><tr><th>Producto</th><th class="r">Cant.</th><th class="r">Total</th></tr></thead><tbody>${doc.items
          .map((i) => `<tr><td>${esc(i.name)}</td><td class="r num">${i.qty}</td><td class="r num">${m(i.total)}</td></tr>`)
          .join("")}</tbody></table>`
      : '<p class="muted">Sin productos vendidos.</p>';
    return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>Cierre de caja ${esc(doc.dayLabel)} · ${esc(doc.shopName)}</title>
<style>${opts.fontCss ?? ""}${PAPER_CSS}${CASH_A4_CSS}</style></head><body>
<div class="hero"><div class="rule"></div><p class="eyebrow">Cierre de caja · ${esc(doc.shopName)}</p><h1 class="num">${esc(doc.dayLabel)}</h1><p class="muted">Impreso el ${esc(doc.printedAt)}.</p></div>
<div class="facts" style="--cols:4">
  <div class="hl"><div class="k">Total vendido</div><div class="v big num" data-total>${m(doc.total)}</div></div>
  <div><div class="k">Efectivo a contar</div><div class="v big num">${m(doc.cash)}</div></div>
  <div><div class="k">Otros medios</div><div class="v big num">${m(doc.nonCash)}</div></div>
  <div><div class="k">Ventas</div><div class="v big num">${doc.count}</div></div>
</div>
<p class="small muted" style="margin-top:8px">${doc.units} unidades vendidas${Number(doc.discount) > 0 ? ` · descuentos ${m(doc.discount)}` : ""}${doc.cancelled.count ? ` · ${doc.cancelled.count} ${doc.cancelled.count === 1 ? "venta anulada" : "ventas anuladas"} por ${m(doc.cancelled.total)} (no suman)` : ""}${doc.onAccount && Number(doc.onAccount) > 0 ? ` · fiado del día ${m(doc.onAccount)} (no entra a la caja)` : ""}${doc.collected && Number(doc.collected) > 0 ? ` · cobros de cuentas ${m(doc.collected)} (sumados por medio de pago)` : ""}.</p>
<div class="cols"><div><h2><span class="idx">01</span>Por medio de pago</h2>${pay}${
      doc.collections?.length
        ? `<h3 style="margin-top:14px">Cobros de cuentas corrientes</h3><table class="t"><tbody>${doc.collections
            .map((c) => `<tr><td>${esc(c.label)}</td><td class="r num">${c.count}</td><td class="r num">${m(c.total)}</td></tr>`)
            .join("")}</tbody></table>`
        : ""
    }</div><div><h2><span class="idx">02</span>Por vendedor</h2>${sellers}</div></div>
<h2><span class="idx">03</span>Productos vendidos</h2>${items}
<div class="count-box"><p class="label" style="margin:0">Arqueo · efectivo contado en la caja</p><div class="sign"><div>Efectivo contado</div><div>Diferencia</div><div>Firma</div></div></div>
</body></html>`;
  }
  const vars = format === 58 ? "--fs:8pt;--pad:2.5mm" : "--fs:9pt;--pad:4mm";
  const row = (a: string, b: string, cls = "") => `<div class="row ${cls}"><span>${a}</span><span>${b}</span></div>`;
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>Cierre de caja ${esc(doc.dayLabel)}</title>
<style>${opts.fontCss ?? ""}:root{--sans:${SANS};--serif:${SERIF};${vars}}${TICKET_CSS}</style></head><body>
<div class="c"><div class="name">${esc(doc.shopName)}</div><div class="type">Cierre de caja</div><div>${esc(doc.dayLabel)}</div><div class="small">Impreso ${esc(doc.printedAt)}</div></div>
<hr class="sep">
${doc.payments.map((p) => row(`${esc(p.label)} (${p.count})`, m(p.total))).join("") || '<div class="c small">Sin ventas en el día</div>'}
<hr class="sep">
${doc.collections?.length ? `<div class="small">Cobros de cuentas</div>${doc.collections.map((c) => row(`${esc(c.label)} (${c.count})`, m(c.total), "small")).join("")}<hr class="sep">` : ""}
${row("Efectivo a contar", m(doc.cash))}${row("Otros medios", m(doc.nonCash))}${doc.onAccount && Number(doc.onAccount) > 0 ? row("Fiado del día", m(doc.onAccount)) : ""}
${row("TOTAL", `<span data-total>${m(doc.total)}</span>`, "total")}
${row(`${doc.count} ventas`, `${doc.units} unidades`, "small")}
${doc.cancelled.count ? row(`Anuladas (${doc.cancelled.count})`, m(doc.cancelled.total), "small") : ""}
${Number(doc.discount) > 0 ? row("Descuentos", m(doc.discount), "small") : ""}
${doc.sellers.length > 1 ? `<hr class="sep">${doc.sellers.map((s) => row(`${esc(s.name)} (${s.count})`, m(s.total), "small")).join("")}` : ""}
<hr class="sep">
<div class="sign small">Efectivo contado</div>
<div class="sign small">Firma</div>
</body></html>`;
}

export async function renderCashClosePdf(doc: CashCloseDoc, format: "a4" | TicketWidth): Promise<Buffer> {
  const fontCss = docFontCss();
  const html = renderCashCloseHtml(doc, format, { fontCss });
  if (format !== "a4") return htmlToPdf(html, { rollWidthMm: format });
  const initials =
    doc.shopName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "·";
  const { header, footer } = pageChrome({
    brand: { name: doc.shopName, initials },
    fontCss,
    right: `Cierre de caja · ${esc(doc.dayLabel)}`,
    footerLeft: `${esc(doc.shopName)} · impreso ${esc(doc.printedAt)}`,
  });
  return htmlToPdf(html, { headerTemplate: header, footerTemplate: footer });
}
