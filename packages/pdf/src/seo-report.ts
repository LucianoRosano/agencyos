/**
 * Informe PDF de una auditoría SEO (docs/02 §M07, docs/07 §5): A4, márgenes de 18 mm, Geist,
 * encabezado con la marca y pie con página y fecha. Legible en blanco y negro: la severidad
 * siempre va escrita, nunca solo por color. Plantilla pura (sin Node ni navegador).
 */
import { formatDate } from "@agencyos/core";
import { geistFontCss } from "./fonts";
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

const esc = (s: string | number | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const CSS = `
:root { --ink:#111114; --muted:#55565e; --faint:#8a8b93; --rule:#d9d9de; --soft:#f4f4f6; --accent:#60A5FA; }
* { box-sizing:border-box; }
html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { margin:0; color:var(--ink); font-family:"Geist", ui-sans-serif, system-ui, sans-serif; font-size:10pt; line-height:1.5; font-feature-settings:"tnum" 1; }
h1,h2,h3 { margin:0; font-weight:600; letter-spacing:-0.015em; }
h1 { font-size:24pt; line-height:1.15; margin:8px 0 6px; }
h2 { font-size:13pt; margin:26px 0 10px; display:flex; gap:10px; align-items:baseline; }
h2 .idx { font-size:9pt; color:var(--faint); font-weight:500; letter-spacing:0.08em; }
h3 { font-size:10.5pt; }
p { margin:0 0 6px; }
.eyebrow { font-size:8pt; letter-spacing:0.18em; text-transform:uppercase; color:var(--muted); }
.rule { height:2px; width:44px; background:var(--accent); border-radius:2px; margin:0 0 12px; }
.muted { color:var(--muted); }
.num { font-variant-numeric:tabular-nums; white-space:nowrap; }
.hero { display:grid; grid-template-columns:auto 1fr; gap:28px; align-items:center; margin-top:18px; padding:18px; border:1px solid var(--ink); border-radius:12px; }
.score { width:118px; height:118px; border-radius:50%; border:6px solid var(--ink); display:grid; place-items:center; text-align:center; }
.score b { display:block; font-size:34pt; line-height:1; letter-spacing:-0.03em; }
.score span { font-size:8pt; color:var(--muted); letter-spacing:0.12em; text-transform:uppercase; }
.stats { display:grid; grid-template-columns:repeat(3,1fr); gap:10px 16px; }
.stats .k { font-size:7.5pt; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); }
.stats .v { font-size:11pt; font-weight:500; }
.formula { margin-top:12px; font-size:8.5pt; color:var(--muted); border-left:2px solid var(--rule); padding-left:10px; }
table { width:100%; border-collapse:collapse; font-size:9pt; }
th { text-align:left; font-size:7.5pt; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); font-weight:500; padding:0 6px 6px; border-bottom:1.5px solid var(--ink); }
td { padding:7px 6px; border-bottom:1px solid var(--rule); vertical-align:top; }
tr { break-inside:avoid; }
.r { text-align:right; }
.issue { border:1px solid var(--rule); border-radius:10px; padding:12px 14px; margin:0 0 10px; break-inside:avoid; }
.issue .head { display:flex; justify-content:space-between; gap:12px; align-items:baseline; }
.sev { display:inline-block; border:1px solid var(--ink); border-radius:5px; padding:0 6px; font-size:7.5pt; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; margin-right:6px; }
.sev.critical { background:var(--ink); color:#fff; }
.sev.high { border-width:2px; }
.sev.low { border-style:dashed; }
.issue .why, .issue .fix { font-size:9pt; margin-top:4px; }
.issue .fix b, .issue .why b { font-weight:600; }
.urls { margin:6px 0 0; padding-left:16px; font-size:8.5pt; color:var(--muted); word-break:break-all; }
.note { border:1px dashed var(--ink); border-radius:10px; padding:10px 12px; font-size:9pt; }
.cmp { display:grid; grid-template-columns:repeat(4,1fr); border:1px solid var(--ink); border-radius:10px; overflow:hidden; }
.cmp > div { padding:10px 12px; border-left:1px solid var(--rule); }
.cmp > div:first-child { border-left:0; }
.cmp .k { font-size:7.5pt; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); }
.cmp .v { font-size:13pt; font-weight:600; }
@page { size:A4; margin:18mm; }
`;

const MAX_URLS = 8;

export function renderSeoReportHtml(doc: SeoReportDoc, opts: { fontCss?: string } = {}): string {
  let idx = 0;
  const h2 = (t: string) => `<h2><span class="idx">${String(++idx).padStart(2, "0")}</span>${esc(t)}</h2>`;
  const delta = (n: number | null) => (n === null ? "—" : n > 0 ? `▲ +${n}` : n < 0 ? `▼ ${n}` : "= 0");
  const cats = doc.categories
    .map(
      (c) =>
        `<tr><td>${esc(c.label)}</td><td class="r num">${c.score ?? "—"}</td><td class="r num">${c.critical}</td><td class="r num">${c.high}</td><td class="r num">${c.medium}</td><td class="r num">${c.low}</td></tr>`,
    )
    .join("");
  const groups = doc.groups
    .map(
      (g) => `<div class="issue">
  <div class="head"><h3><span class="sev ${esc(g.severity)}">${esc(g.severityLabel)}</span>${esc(g.title)}</h3><span class="num muted">${g.count} URL${g.count === 1 ? "" : "s"} · ${esc(g.category)}</span></div>
  <p class="why"><b>Por qué importa:</b> ${esc(g.why)}</p>
  <p class="fix"><b>Cómo corregirlo:</b> ${esc(g.fix)}</p>
  ${
    g.urls.length
      ? `<ul class="urls">${g.urls
          .slice(0, MAX_URLS)
          .map((u) => `<li>${esc(u)}</li>`)
          .join("")}${g.urls.length > MAX_URLS ? `<li>… y ${g.urls.length - MAX_URLS} más (ver CSV)</li>` : ""}</ul>`
      : '<p class="muted" style="font-size:8.5pt;margin-top:4px">Afecta a todo el sitio.</p>'
  }
</div>`,
    )
    .join("");
  const lab = doc.lab.length
    ? `<table><thead><tr><th>URL</th><th>Dispositivo</th><th class="r">Rendimiento</th><th class="r">Accesibilidad</th><th class="r">Buenas prácticas</th><th class="r">SEO</th></tr></thead><tbody>${doc.lab
        .map(
          (l) =>
            `<tr><td style="word-break:break-all">${esc(l.url)}</td><td>${esc(l.strategy)}</td><td class="r num">${l.performance ?? "—"}</td><td class="r num">${l.accessibility ?? "—"}</td><td class="r num">${l.bestPractices ?? "—"}</td><td class="r num">${l.seo ?? "—"}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table><p class="muted" style="font-size:8.5pt;margin-top:6px">Datos de laboratorio (Lighthouse vía PageSpeed Insights), tal como los devuelve Google.</p>`
    : "";
  const field = doc.field.length
    ? `<table style="margin-top:12px"><thead><tr><th>Origen / URL</th><th>Dispositivo</th><th class="r">LCP p75</th><th class="r">INP p75</th><th class="r">CLS p75</th></tr></thead><tbody>${doc.field
        .map((f) =>
          f.hasData
            ? `<tr><td style="word-break:break-all">${esc(f.target)}</td><td>${esc(f.formFactor)}</td><td class="r num">${esc(f.lcp)}</td><td class="r num">${esc(f.inp)}</td><td class="r num">${esc(f.cls)}</td></tr>`
            : `<tr><td style="word-break:break-all">${esc(f.target)}</td><td>${esc(f.formFactor)}</td><td colspan="3" class="muted">Sin datos de campo suficientes</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table><p class="muted" style="font-size:8.5pt;margin-top:6px">Datos de campo: usuarios reales de Chrome (CrUX), percentil 75 de los últimos 28 días.</p>`
    : "";
  const cmp = doc.compare
    ? `${h2("Comparación con la auditoría anterior")}
<p class="muted">Contra la auditoría del ${esc(formatDate(doc.compare.previousOn))} (puntaje ${doc.compare.previousScore ?? "—"}).</p>
<div class="cmp"><div><div class="k">Puntaje</div><div class="v num">${esc(delta(doc.compare.scoreDelta))}</div></div><div><div class="k">Nuevos</div><div class="v num">${doc.compare.added}</div></div><div><div class="k">Resueltos</div><div class="v num">${doc.compare.resolved}</div></div><div><div class="k">Persistentes</div><div class="v num">${doc.compare.persistent}</div></div></div>`
    : "";

  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>Auditoría SEO · ${esc(doc.host)}</title>
<style>${opts.fontCss ?? ""}${CSS}</style></head><body>
<p class="eyebrow">Auditoría SEO · ${esc(formatDate(doc.auditedOn))}</p>
<div class="rule"></div>
<h1>${esc(doc.siteName ?? doc.host)}</h1>
<p class="muted">${esc(doc.rootUrl)} · preparado por ${esc(doc.brand.name)}</p>
<div class="hero">
  <div class="score"><div><b class="num">${doc.score ?? "—"}</b><span>de 100</span></div></div>
  <div class="stats">${doc.stats.map((s) => `<div><div class="k">${esc(s.label)}</div><div class="v num">${esc(s.value)}</div></div>`).join("")}</div>
</div>
<p class="formula"><b>Cómo se calcula (${esc(doc.formulaVersion)}):</b> ${esc(doc.formulaText)}</p>
${cmp}
${h2("Resultados por categoría")}
<table><thead><tr><th>Categoría</th><th class="r">Puntaje</th><th class="r">Críticos</th><th class="r">Altos</th><th class="r">Medios</th><th class="r">Bajos</th></tr></thead><tbody>${cats}</tbody></table>
${h2("Rendimiento y Core Web Vitals")}
${doc.googleNote ? `<p class="note">${esc(doc.googleNote)}</p>` : ""}${lab}${field}
${h2("Problemas y cómo corregirlos")}
${groups || '<p class="note">No se encontraron problemas en las páginas rastreadas.</p>'}
<p class="muted" style="font-size:8.5pt;margin-top:14px">Datos reales del rastreo de ${doc.pagesCrawled} páginas con AGENCYOS-SEO-Auditor/1.0, respetando robots.txt. El detalle completo por URL está en el CSV de problemas.</p>
</body></html>`;
}

export function seoReportHeaderFooter(doc: Pick<SeoReportDoc, "brand" | "host" | "auditedOn">, fontCss = "") {
  const base = `${fontCss}<style>*{font-family:"Geist",ui-sans-serif,system-ui,sans-serif;-webkit-print-color-adjust:exact;}</style>`;
  const header = `${base}<div style="width:100%;padding:0 18mm;display:flex;align-items:center;justify-content:space-between;font-size:7.5pt;color:#55565e;">
    <span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border:0.8px solid #111114;border-radius:4px;font-size:6pt;font-weight:600;color:#111114;">${esc(doc.brand.initials)}</span><span style="color:#111114;font-weight:600;">${esc(doc.brand.name)}</span></span>
    <span>Auditoría SEO · ${esc(doc.host)}</span></div>`;
  const footer = `${base}<div style="width:100%;padding:0 18mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#55565e;">
    <span>${esc(doc.brand.name)} · ${esc(formatDate(doc.auditedOn))}</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
  return { header, footer };
}

export async function renderSeoReportPdf(doc: SeoReportDoc): Promise<Buffer> {
  const fontCss = geistFontCss();
  const html = renderSeoReportHtml(doc, { fontCss });
  const { header, footer } = seoReportHeaderFooter(doc, `<style>${fontCss}</style>`);
  return htmlToPdf(html, { headerTemplate: header, footerTemplate: footer });
}
