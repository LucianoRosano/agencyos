/**
 * Plantilla HTML del briefing del sitio (PDF con la marca hacia el cliente). Pura: sin Node ni navegador.
 * Legible en blanco y negro: lo que falta se marca con texto, no solo con color (docs/07 §5).
 */
import { formatDate } from "@agencyos/core";
import { esc, letterhead, PAPER_CSS, pageChrome, sectionCounter } from "./paper";

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

const multiline = (s: string) => esc(s).replace(/\n/g, "<br>");

const CSS = `
body { font-size:10.5pt; }
.hero { margin:40px 0 24px; }
.hero .rule { height:2pt; width:46px; background:var(--accent); margin:0 0 14px; }
section.block { margin:0 0 18px; }
section.block > h2:first-child { margin-top:0; }
table.rows { width:100%; border-collapse:collapse; font-size:9.5pt; }
table.rows td { padding:7px 8px 7px 0; border-bottom:0.5pt solid var(--rule); vertical-align:top; }
table.rows tr { break-inside:avoid; }
table.rows td.k { width:34%; color:var(--muted); }
.missing { display:inline-block; border:0.6pt dashed var(--ink); border-radius:3px; padding:0 6px; font-size:7pt; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); }
ol.questions { margin:0; padding-left:22px; }
ol.questions li { margin:0 0 8px; padding-bottom:8px; break-inside:avoid; }
ol.questions li::marker { color:var(--accent); font-weight:600; }
ol.questions li .answer { display:block; margin-top:16px; border-bottom:0.5pt solid var(--rule); height:1px; }
`;

export function renderBriefHtml(doc: BriefDoc, opts: { fontCss?: string } = {}): string {
  const b = doc.brand;
  const h2 = sectionCounter();
  const blocks = doc.blocks
    .map(
      (bl) =>
        `<section class="block">${h2(bl.title)}<table class="rows"><tbody>${bl.rows
          .map((r) => `<tr><td class="k">${esc(r.label)}</td><td>${r.value?.trim() ? multiline(r.value) : '<span class="missing">Falta</span>'}</td></tr>`)
          .join("")}</tbody></table></section>`,
    )
    .join("");
  const questions = doc.questions.length
    ? `<section class="block">${h2("Preguntas para el cliente")}<p class="label" style="margin:0 0 10px">${doc.questions.length} ${doc.questions.length === 1 ? "pregunta" : "preguntas"} · una sola lista</p><ol class="questions">${doc.questions
        .map((q) => `<li>${esc(q)}<span class="answer"></span></li>`)
        .join("")}</ol></section>`
    : `<section class="block">${h2("Preguntas para el cliente")}<p>No quedan preguntas pendientes.</p></section>`;
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>Briefing · ${esc(doc.siteName)}</title>
<style>${opts.fontCss ?? ""}${PAPER_CSS}${CSS}</style></head><body>
${letterhead(b, { large: true, sub: "Briefing" })}
<div class="hero">
  <div class="rule"></div>
  <div class="eyebrow">Briefing del sitio${doc.version > 1 ? ` · revisión ${doc.version}` : ""}</div>
  <h1>${esc(doc.siteName)}</h1>
  <div class="facts" style="--cols:4">
    <div><div class="k">Cliente</div><div class="v">${esc(doc.clientName ?? "—")}</div></div>
    <div><div class="k">Tipo</div><div class="v">${esc(doc.kindLabel)}</div></div>
    <div><div class="k">Tecnología</div><div class="v">${esc(doc.stackLabel)}</div></div>
    <div><div class="k">Fecha</div><div class="v num">${formatDate(doc.issueDate)}</div></div>
  </div>
</div>
${blocks}
${questions}
<p class="note">Este documento resume lo relevado para el sitio. Los datos marcados como «Falta» se completan con las respuestas a las preguntas. Las claves y accesos nunca se envían por este medio.</p>
</body></html>`;
}

/** Encabezado y pie de Chromium para el briefing. */
export function briefHeaderFooter(doc: Pick<BriefDoc, "brand" | "siteName" | "issueDate">, fontCss = "") {
  return pageChrome({
    brand: doc.brand,
    fontCss,
    right: `Briefing · ${esc(doc.siteName)}`,
    footerLeft: `${esc(doc.brand.name)} · ${formatDate(doc.issueDate)}`,
  });
}
