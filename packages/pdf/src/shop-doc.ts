/**
 * Comprobante de venta y remito del comercio (SaaS, ADR 0016): A4 con la papelería común, en el formato que
 * conoce cualquier comercio argentino (recuadro «X», punto de venta y número), siempre aclarando que no es
 * una factura. El remito puede ir con o sin precios. Plantilla pura (sin Node ni navegador).
 */
import { formatMoney } from "@agencyos/core";
import { docFontCss } from "./fonts";
import { esc, PAPER_CSS, pageChrome } from "./paper";
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
