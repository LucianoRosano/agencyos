/**
 * Informe PDF de una auditoría SEO (docs/02 §M07, docs/07 §5): A4, márgenes de 18 mm, papelería común (Inter + Source Serif),
 * encabezado con la marca y pie con página y fecha. Legible en blanco y negro: la severidad
 * siempre va escrita, nunca solo por color. Plantilla pura (sin Node ni navegador).
 */
import { formatDate } from "@agencyos/core";
import { docFontCss } from "./fonts";
import { esc, letterhead, PAPER_CSS, pageChrome, sectionCounter } from "./paper";
import { htmlToPdf } from "./render";

export type SeoReportDoc = {
  brand: { name: string; initials: string; email: string | null; phone: string | null; website: string | null };
  host: string;
  rootUrl: string;
  siteName: string | null;
  auditedOn: string; // YYYY-MM-DD
  score: number | null;
  formulaVersion: string;
  formulaText: string;
  pagesCrawled: number;
  stats: { label: string; value: string }[];
  categories: { label: string; score: number | null; critical: number; high: number; medium: number; low: number }[];
  groups: { severity: string; severityLabel: string; category: string; title: string; why: string; fix: string; count: number; urls: string[] }[];
  lab: { url: string; strategy: string; performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null }[];
  field: { target: string; formFactor: string; hasData: boolean; lcp: string; inp: string; cls: string }[];
  googleNote: string | null;
  compare: { previousOn: string; previousScore: number | null; scoreDelta: number | null; added: number; resolved: number; persistent: number } | null;
};

const CSS = `
.hero-t { margin:40px 0 0; }
.hero-t .rule { height:2pt; width:46px; background:var(--accent); margin:0 0 14px; }
.hero { display:grid; grid-template-columns:auto 1fr; gap:30px; align-items:center; margin-top:20px; padding:16px 0; border-top:0.75pt solid var(--ink); border-bottom:0.75pt solid var(--ink); break-inside:avoid; }
.score { width:116px; height:116px; border-radius:50%; border:1.2pt solid var(--accent); box-shadow:inset 0 0 0 3pt #fff, inset 0 0 0 3.7pt var(--accent); display:grid; place-items:center; text-align:center; }
.score b { display:block; font-family:var(--serif); font-size:36pt; font-weight:600; line-height:1; color:var(--accent); }
.score span { font-size:7pt; color:var(--muted); letter-spacing:0.14em; text-transform:uppercase; font-weight:600; }
.stats { display:grid; grid-template-columns:repeat(3,1fr); gap:12px 18px; }
.stats .k { font-size:7pt; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); font-weight:600; }
.stats .v { font-size:11pt; font-weight:500; }
.formula { margin-top:12px; font-size:8.5pt; color:var(--muted); border-left:2pt solid var(--rule); padding-left:10px; }
.issue .head { display:flex; justify-content:space-between; gap:12px; align-items:baseline; }
.issue h3 { font-family:var(--serif); font-size:11pt; }
.sev { display:inline-block; border:0.6pt solid var(--ink); border-radius:3px; padding:0 5px; font-family:var(--sans); font-size:6.5pt; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; margin-right:7px; vertical-align:2px; }
.sev.critical { background:var(--ink); color:#fff; }
.sev.high { border-width:1.4pt; }
.sev.low { border-style:dashed; }
.issue .why, .issue .fix { font-size:9pt; margin-top:4px; }
.urls { margin:6px 0 0; padding-left:16px; font-size:8.5pt; color:var(--muted); word-break:break-all; }
`;

const MAX_URLS = 8;

export function renderSeoReportHtml(doc: SeoReportDoc, opts: { fontCss?: string } = {}): string {
  const h2 = sectionCounter();
  const delta = (n: number | null) => (n === null ? "—" : n > 0 ? `▲ +${n}` : n < 0 ? `▼ ${n}` : "= 0");
  const cats = doc.categories
    .map(
      (c) =>
        `<tr><td>${esc(c.label)}</td><td class="r num">${c.score ?? "—"}</td><td class="r num">${c.critical}</td><td class="r num">${c.high}</td><td class="r num">${c.medium}</td><td class="r num">${c.low}</td></tr>`,
    )
    .join("");
  const groups = doc.groups
    .map(
      (g) => `<div class="card issue">
  <div class="head"><h3><span class="sev ${esc(g.severity)}">${esc(g.severityLabel)}</span>${esc(g.title)}</h3><span class="num muted">${g.count} URL${g.count === 1 ? "" : "s"} · ${esc(g.category)}</span></div>
  <p class="why"><b>Por qué importa:</b> ${esc(g.why)}</p>
  <p class="fix"><b>Cómo corregirlo:</b> ${esc(g.fix)}</p>
  ${
    g.urls.length
      ? `<ul class="urls">${g.urls
          .slice(0, MAX_URLS)
          .map((u) => `<li>${esc(u)}</li>`)
          .join("")}${g.urls.length > MAX_URLS ? `<li>… y ${g.urls.length - MAX_URLS} más (ver CSV)</li>` : ""}</ul>`
      : '<p class="muted small" style="margin-top:4px">Afecta a todo el sitio.</p>'
  }
</div>`,
    )
    .join("");
  const lab = doc.lab.length
    ? `<table class="t"><thead><tr><th>URL</th><th>Dispositivo</th><th class="r">Rendimiento</th><th class="r">Accesibilidad</th><th class="r">Buenas prácticas</th><th class="r">SEO</th></tr></thead><tbody>${doc.lab
        .map(
          (l) =>
            `<tr><td style="word-break:break-all">${esc(l.url)}</td><td>${esc(l.strategy)}</td><td class="r num">${l.performance ?? "—"}</td><td class="r num">${l.accessibility ?? "—"}</td><td class="r num">${l.bestPractices ?? "—"}</td><td class="r num">${l.seo ?? "—"}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table><p class="muted small" style="margin-top:6px">Datos de laboratorio (Lighthouse vía PageSpeed Insights), tal como los devuelve Google.</p>`
    : "";
  const field = doc.field.length
    ? `<table class="t" style="margin-top:14px"><thead><tr><th>Origen / URL</th><th>Dispositivo</th><th class="r">LCP p75</th><th class="r">INP p75</th><th class="r">CLS p75</th></tr></thead><tbody>${doc.field
        .map((f) =>
          f.hasData
            ? `<tr><td style="word-break:break-all">${esc(f.target)}</td><td>${esc(f.formFactor)}</td><td class="r num">${esc(f.lcp)}</td><td class="r num">${esc(f.inp)}</td><td class="r num">${esc(f.cls)}</td></tr>`
            : `<tr><td style="word-break:break-all">${esc(f.target)}</td><td>${esc(f.formFactor)}</td><td colspan="3" class="muted">Sin datos de campo suficientes</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table><p class="muted small" style="margin-top:6px">Datos de campo: usuarios reales de Chrome (CrUX), percentil 75 de los últimos 28 días.</p>`
    : "";
  const cmp = doc.compare
    ? `${h2("Comparación con la auditoría anterior")}
<p class="muted">Contra la auditoría del ${esc(formatDate(doc.compare.previousOn))} (puntaje ${doc.compare.previousScore ?? "—"}).</p>
<div class="facts" style="--cols:4;margin-top:10px"><div><div class="k">Puntaje</div><div class="v big num">${esc(delta(doc.compare.scoreDelta))}</div></div><div><div class="k">Nuevos</div><div class="v big num">${doc.compare.added}</div></div><div><div class="k">Resueltos</div><div class="v big num">${doc.compare.resolved}</div></div><div><div class="k">Persistentes</div><div class="v big num">${doc.compare.persistent}</div></div></div>`
    : "";

  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>Auditoría SEO · ${esc(doc.host)}</title>
<style>${opts.fontCss ?? ""}${PAPER_CSS}${CSS}</style></head><body>
${letterhead(doc.brand, { large: true, sub: "Auditoría SEO" })}
<div class="hero-t">
<div class="rule"></div>
<p class="eyebrow">Auditoría SEO · <span class="num">${esc(formatDate(doc.auditedOn))}</span></p>
<h1>${esc(doc.siteName ?? doc.host)}</h1>
<p class="muted">${esc(doc.rootUrl)} · preparado por ${esc(doc.brand.name)}</p>
</div>
<div class="hero">
  <div class="score"><div><b class="num">${doc.score ?? "—"}</b><span>de 100</span></div></div>
  <div class="stats">${doc.stats.map((s) => `<div><div class="k">${esc(s.label)}</div><div class="v num">${esc(s.value)}</div></div>`).join("")}</div>
</div>
<p class="formula"><b>Cómo se calcula (${esc(doc.formulaVersion)}):</b> ${esc(doc.formulaText)}</p>
${cmp}
${h2("Resultados por categoría")}
<table class="t"><thead><tr><th>Categoría</th><th class="r">Puntaje</th><th class="r">Críticos</th><th class="r">Altos</th><th class="r">Medios</th><th class="r">Bajos</th></tr></thead><tbody>${cats}</tbody></table>
${h2("Rendimiento y Core Web Vitals")}
${doc.googleNote ? `<p class="note" style="margin-bottom:12px">${esc(doc.googleNote)}</p>` : ""}${lab}${field}
${h2("Problemas y cómo corregirlos")}
${groups || '<p class="note">No se encontraron problemas en las páginas rastreadas.</p>'}
<p class="closing"><span>Datos reales del rastreo de ${doc.pagesCrawled} páginas con AGENCYOS-SEO-Auditor/1.0, respetando robots.txt. El detalle completo por URL está en el CSV de problemas.</span></p>
</body></html>`;
}

export function seoReportHeaderFooter(doc: Pick<SeoReportDoc, "brand" | "host" | "auditedOn">, fontCss = "") {
  return pageChrome({
    brand: doc.brand,
    fontCss,
    right: `Auditoría SEO · ${esc(doc.host)}`,
    footerLeft: `${esc(doc.brand.name)} · ${esc(formatDate(doc.auditedOn))}`,
  });
}

export async function renderSeoReportPdf(doc: SeoReportDoc): Promise<Buffer> {
  const fontCss = docFontCss();
  const html = renderSeoReportHtml(doc, { fontCss });
  const { header, footer } = seoReportHeaderFooter(doc, fontCss);
  return htmlToPdf(html, { headerTemplate: header, footerTemplate: footer });
}
