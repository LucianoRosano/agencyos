/**
 * Plantilla HTML del briefing del sitio (PDF con la marca hacia el cliente). Pura: sin Node ni navegador.
 * Legible en blanco y negro: lo que falta se marca con texto, no solo con color (docs/07 §5).
 */
import { formatDate } from "@agencyos/core";

export type BriefDocRow = { label: string; value: string | null };
export type BriefDoc = {
  brand: { name: string; initials: string; email: string | null; phone: string | null; website: string | null };
  siteName: string;
  clientName: string | null;
  kindLabel: string;
  stackLabel: string;
  issueDate: string;
  version: number;
  blocks: { title: string; rows: BriefDocRow[] }[];
  questions: string[];
};

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const multiline = (s: string) => esc(s).replace(/\n/g, "<br>");

const CSS = `
:root { --ink:#111114; --muted:#55565e; --faint:#8a8b93; --rule:#d9d9de; --accent:#F472B6; }
* { box-sizing:border-box; }
html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { margin:0; color:var(--ink); font-family:"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size:10.5pt; line-height:1.5; }
h1,h2 { margin:0; font-weight:600; letter-spacing:-0.015em; }
h2 { font-size:12.5pt; margin:0 0 8px; display:flex; align-items:baseline; gap:10px; break-after:avoid; }
h2 .idx { font-size:9pt; color:var(--faint); font-weight:500; letter-spacing:0.08em; }
.eyebrow { font-size:8pt; letter-spacing:0.18em; text-transform:uppercase; color:var(--muted); font-weight:500; }
.mono { display:inline-grid; place-items:center; width:40px; height:40px; border:1.25px solid var(--ink); border-radius:10px; font-weight:600; font-size:13pt; letter-spacing:-0.04em; line-height:1; flex:none; }
.top { display:flex; justify-content:space-between; align-items:center; gap:24px; padding-bottom:16px; border-bottom:1px solid var(--rule); }
.brand { display:flex; align-items:center; gap:12px; }
.brand-name { font-weight:600; font-size:12pt; }
.contact { text-align:right; font-size:9pt; color:var(--muted); line-height:1.6; }
.hero { margin:34px 0 26px; }
.rule { height:2px; width:44px; background:var(--accent); border-radius:2px; margin:0 0 12px; }
.hero h1 { font-size:24pt; line-height:1.15; margin:8px 0 10px; }
.facts { display:grid; grid-template-columns:repeat(4, 1fr); border:1px solid var(--ink); border-radius:10px; overflow:hidden; }
.facts > div { padding:10px 12px; border-left:1px solid var(--rule); }
.facts > div:first-child { border-left:0; }
.facts .k { font-size:7.5pt; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted); }
.facts .v { font-size:10.5pt; font-weight:500; margin-top:2px; }
section.block { margin:0 0 20px; }
table.rows { width:100%; border-collapse:collapse; font-size:9.5pt; }
table.rows td { padding:7px 8px 7px 0; border-bottom:1px solid var(--rule); vertical-align:top; }
table.rows tr { break-inside:avoid; }
table.rows td.k { width:34%; color:var(--muted); }
.missing { display:inline-block; border:1px dashed var(--ink); border-radius:5px; padding:0 6px; font-size:8pt; letter-spacing:0.06em; text-transform:uppercase; color:var(--muted); }
ol.questions { margin:0; padding-left:22px; }
ol.questions li { margin:0 0 8px; padding-bottom:8px; border-bottom:1px dotted var(--rule); break-inside:avoid; }
ol.questions li .answer { display:block; margin-top:14px; border-bottom:1px solid var(--rule); height:1px; }
.note { border:1px solid var(--ink); border-radius:10px; padding:10px 12px; font-size:9pt; color:var(--muted); break-inside:avoid; }
@page { size:A4; margin:18mm; }
`;

export function renderBriefHtml(doc: BriefDoc, opts: { fontCss?: string } = {}): string {
  const b = doc.brand;
  const contact = [b.email, b.phone ? `WhatsApp ${b.phone}` : null, b.website].filter(Boolean) as string[];
  let idx = 0;
  const h2 = (t: string) => `<h2><span class="idx">${String(++idx).padStart(2, "0")}</span>${esc(t)}</h2>`;
  const blocks = doc.blocks
    .map(
      (bl) =>
        `<section class="block">${h2(bl.title)}<table class="rows"><tbody>${bl.rows
          .map((r) => `<tr><td class="k">${esc(r.label)}</td><td>${r.value?.trim() ? multiline(r.value) : '<span class="missing">Falta</span>'}</td></tr>`)
          .join("")}</tbody></table></section>`,
    )
    .join("");
  const questions = doc.questions.length
    ? `<section class="block">${h2("Preguntas para el cliente")}<p class="eyebrow" style="margin:0 0 10px">${doc.questions.length} ${doc.questions.length === 1 ? "pregunta" : "preguntas"} · una sola lista</p><ol class="questions">${doc.questions
        .map((q) => `<li>${esc(q)}<span class="answer"></span></li>`)
        .join("")}</ol></section>`
    : `<section class="block">${h2("Preguntas para el cliente")}<p>No quedan preguntas pendientes.</p></section>`;
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>Briefing · ${esc(doc.siteName)}</title>
<style>${opts.fontCss ?? ""}${CSS}</style></head><body>
<div class="top">
  <div class="brand"><span class="mono" aria-hidden="true">${esc(b.initials)}</span><div class="brand-name">${esc(b.name)}</div></div>
  <div class="contact">${contact.map(esc).join("<br>")}</div>
</div>
<div class="hero">
  <div class="rule"></div>
  <div class="eyebrow">Briefing del sitio${doc.version > 1 ? ` · revisión ${doc.version}` : ""}</div>
  <h1>${esc(doc.siteName)}</h1>
  <div class="facts">
    <div><div class="k">Cliente</div><div class="v">${esc(doc.clientName ?? "—")}</div></div>
    <div><div class="k">Tipo</div><div class="v">${esc(doc.kindLabel)}</div></div>
    <div><div class="k">Tecnología</div><div class="v">${esc(doc.stackLabel)}</div></div>
    <div><div class="k">Fecha</div><div class="v">${formatDate(doc.issueDate)}</div></div>
  </div>
</div>
${blocks}
${questions}
<p class="note">Este documento resume lo relevado para el sitio. Los datos marcados como «Falta» se completan con las respuestas a las preguntas. Las claves y accesos nunca se envían por este medio.</p>
</body></html>`;
}

/** Encabezado y pie de Chromium para el briefing. */
export function briefHeaderFooter(doc: Pick<BriefDoc, "brand" | "siteName" | "issueDate">, fontCss = "") {
  const base = `${fontCss}<style>*{font-family:"Geist",ui-sans-serif,system-ui,sans-serif;-webkit-print-color-adjust:exact;}</style>`;
  const header = `${base}<div style="width:100%;padding:0 18mm;display:flex;align-items:center;justify-content:space-between;font-size:7.5pt;color:#55565e;">
    <span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border:0.8px solid #111114;border-radius:4px;font-size:6pt;font-weight:600;color:#111114;">${esc(doc.brand.initials)}</span><span style="color:#111114;font-weight:600;">${esc(doc.brand.name)}</span></span>
    <span>Briefing · ${esc(doc.siteName)}</span></div>`;
  const footer = `${base}<div style="width:100%;padding:0 18mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#55565e;">
    <span>${esc(doc.brand.name)} · ${formatDate(doc.issueDate)}</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
  return { header, footer };
}
