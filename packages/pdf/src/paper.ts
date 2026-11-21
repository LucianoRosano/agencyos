/**
 * Papelería común de los documentos (presupuestos, informes, briefing, comprobantes y remitos).
 * Estilo clásico y sobrio (ADR 0017): papel blanco, tinta cálida, un solo acento terracota, títulos en
 * Source Serif 4 y cifras tabulares en Inter. Pensado para imprimirse en blanco y negro: el color nunca es la
 * única forma de transmitir información (docs/07 §5). Puro: sin Node ni navegador.
 */
import { FAMILY } from "./font-names";

export const esc = (s: string | number | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export const SANS = `"${FAMILY.sans}", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
export const SERIF = `"${FAMILY.serif}", "Source Serif 4", Georgia, "Times New Roman", serif`;

/** Colores de la papelería (también para el encabezado y pie de Chromium, que no heredan el CSS). */
export const INK = { ink: "#1f1a15", muted: "#5f574d", faint: "#8a8075", rule: "#e2dacd", soft: "#f7f3ec", accent: "#a9471f" };

export type PaperBrand = { name: string; initials: string; email: string | null; phone: string | null; website: string | null; city?: string | null };

/** Base: tipografía, membrete, datos clave, tablas, secciones numeradas y notas. Cada plantilla suma lo suyo. */
export const PAPER_CSS = `
:root { --ink:${INK.ink}; --muted:${INK.muted}; --faint:${INK.faint}; --rule:${INK.rule}; --soft:${INK.soft}; --accent:${INK.accent}; --sans:${SANS}; --serif:${SERIF}; }
* { box-sizing:border-box; }
html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { margin:0; color:var(--ink); font-family:var(--sans); font-size:10pt; line-height:1.55; font-feature-settings:"cv11" 1, "ss03" 1; -webkit-font-smoothing:antialiased; }
.num { font-variant-numeric:tabular-nums lining-nums; white-space:nowrap; }
.serif { font-family:var(--serif); }
h1, h2, h3 { margin:0; color:var(--ink); }
h1 { font-family:var(--serif); font-weight:500; font-size:27pt; line-height:1.12; letter-spacing:-0.01em; margin:8px 0 10px; }
h2 { font-family:var(--serif); font-weight:600; font-size:14pt; line-height:1.25; margin:26px 0 10px; display:flex; align-items:baseline; gap:10px; break-after:avoid; }
h2 .idx { font-family:var(--sans); font-size:8pt; font-weight:600; color:var(--accent); letter-spacing:0.08em; font-variant-numeric:tabular-nums; }
h2::after { content:""; flex:1; border-bottom:0.75pt solid var(--rule); transform:translateY(-3pt); margin-left:4px; }
h3 { font-size:10.5pt; font-weight:600; margin:0 0 4px; }
p { margin:0 0 6px; }
a { color:inherit; }
.muted { color:var(--muted); }
.faint { color:var(--faint); }
.small { font-size:8.5pt; }
.eyebrow { font-size:7.5pt; letter-spacing:0.16em; text-transform:uppercase; color:var(--accent); font-weight:600; }
.label { font-size:7pt; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); font-weight:600; }

/* Membrete */
.letterhead { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; padding-bottom:14px; border-bottom:0.75pt solid var(--ink); position:relative; }
.letterhead::after { content:""; position:absolute; left:0; right:0; bottom:-3.5pt; border-bottom:0.5pt solid var(--rule); }
.brand { display:flex; align-items:center; gap:12px; }
.seal { display:inline-grid; place-items:center; width:38px; height:38px; border-radius:50%; border:0.9pt solid var(--accent); color:var(--accent); font-family:var(--serif); font-weight:600; font-size:13pt; letter-spacing:0.02em; line-height:1; flex:none; }
.seal.lg { width:54px; height:54px; font-size:18pt; border-width:1.1pt; box-shadow:inset 0 0 0 2.5pt #fff, inset 0 0 0 3.1pt var(--accent); }
.brand-name { font-family:var(--serif); font-weight:600; font-size:13.5pt; letter-spacing:0.005em; line-height:1.2; }
.brand-sub { font-size:7.5pt; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted); margin-top:2px; }
.contact { text-align:right; font-size:8.5pt; color:var(--muted); line-height:1.65; }

/* Datos clave: columnas separadas por filetes finos */
.facts { display:grid; grid-template-columns:repeat(var(--cols, 4), 1fr); border-top:0.75pt solid var(--ink); border-bottom:0.75pt solid var(--ink); margin-top:22px; break-inside:avoid; }
.facts > div { padding:10px 14px 11px; border-left:0.5pt solid var(--rule); }
.facts > div:first-child { border-left:0; padding-left:0; }
.facts .k { font-size:7pt; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); font-weight:600; }
.facts .v { font-size:11pt; font-weight:500; margin-top:3px; }
.facts .v.big { font-family:var(--serif); font-size:17pt; font-weight:600; line-height:1.15; }
.facts .hl .v { color:var(--accent); }

/* Tablas */
table.t { width:100%; border-collapse:collapse; font-size:9pt; }
table.t th { text-align:left; font-size:7pt; letter-spacing:0.13em; text-transform:uppercase; color:var(--muted); font-weight:600; padding:0 8px 6px; border-bottom:0.75pt solid var(--ink); }
table.t td { padding:7px 8px; border-bottom:0.5pt solid var(--rule); vertical-align:top; }
table.t th:first-child, table.t td:first-child { padding-left:0; }
table.t th:last-child, table.t td:last-child { padding-right:0; }
table.t tr { break-inside:avoid; }
table.t tr.total td { font-weight:600; border-top:0.75pt solid var(--ink); border-bottom:0; }
table.t tr.cur td { background:var(--soft); }
.r, table.t th.r, table.t td.r { text-align:right; }

/* Cajas */
.card { border:0.5pt solid var(--rule); border-radius:6px; padding:12px 14px; margin-bottom:10px; break-inside:avoid; }
.note { border-left:2pt solid var(--accent); background:var(--soft); padding:9px 12px; font-size:9pt; border-radius:0 4px 4px 0; break-inside:avoid; }
.bar { height:5px; border-radius:3px; background:var(--soft); border:0.4pt solid var(--rule); overflow:hidden; }
.bar > i { display:block; height:100%; background:var(--ink); border-radius:3px; }
.tag { display:inline-block; border:0.6pt solid var(--ink); border-radius:3px; padding:0 5px; font-size:7pt; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; line-height:1.6; }
.sign { display:grid; grid-template-columns:repeat(3, 1fr); gap:22px; margin-top:38px; }
.sign div { border-top:0.6pt solid var(--ink); padding-top:5px; font-size:7pt; color:var(--muted); letter-spacing:0.13em; text-transform:uppercase; font-weight:600; }
.closing { margin-top:24px; padding-top:10px; border-top:0.5pt solid var(--rule); font-size:8.5pt; color:var(--muted); display:flex; justify-content:space-between; gap:16px; }
ul, ol { margin:4px 0 6px; padding-left:16px; }
li { margin:2px 0; }

@page { size:A4; margin:18mm; }
`;

/** Membrete: sello con iniciales, nombre de la marca y datos de contacto. */
export function letterhead(b: PaperBrand, opts: { sub?: string; large?: boolean } = {}) {
  const contact = [b.email, b.phone ? `WhatsApp ${b.phone}` : null, b.website, b.city].filter(Boolean) as string[];
  return `<header class="letterhead">
  <div class="brand"><span class="seal${opts.large ? " lg" : ""}" aria-hidden="true">${esc(b.initials)}</span><div><div class="brand-name">${esc(b.name)}</div>${opts.sub ? `<div class="brand-sub">${esc(opts.sub)}</div>` : ""}</div></div>
  <div class="contact">${contact.map(esc).join("<br>")}</div>
</header>`;
}

/** Numerador de secciones («01 Alcance»). */
export function sectionCounter() {
  let idx = 0;
  return (t: string) => `<h2><span class="idx">${String(++idx).padStart(2, "0")}</span>${esc(t)}</h2>`;
}

/** Encabezado y pie de página de Chromium (se repiten en cada hoja). No heredan el CSS del documento. */
export function pageChrome(o: { brand: Pick<PaperBrand, "name" | "initials">; right: string; footerLeft: string; fontCss?: string }) {
  const base = `${o.fontCss ? `<style>${o.fontCss}</style>` : ""}<style>*{font-family:${SANS};-webkit-print-color-adjust:exact;font-variant-numeric:tabular-nums;}</style>`;
  const wrap = (inner: string, extra = "") =>
    `${base}<div style="width:100%;padding:0 18mm;box-sizing:border-box;"><div style="display:flex;align-items:center;justify-content:space-between;font-size:7pt;color:${INK.muted};${extra}">${inner}</div></div>`;
  const header = wrap(
    `<span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:0.6pt solid ${INK.accent};border-radius:50%;font-family:${SERIF};font-size:6pt;font-weight:600;color:${INK.accent};">${esc(o.brand.initials)}</span><span style="font-family:${SERIF};font-size:8pt;color:${INK.ink};font-weight:600;">${esc(o.brand.name)}</span></span><span>${o.right}</span>`,
    `padding-bottom:4px;border-bottom:0.5pt solid ${INK.rule};`,
  );
  const footer = wrap(`<span>${o.footerLeft}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>`);
  return { header, footer };
}
