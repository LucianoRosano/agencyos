/**
 * Informe mensual para el cliente: A4, Geist, la marca de la agencia (Luciano Rosano) y solo las secciones con datos.
 * Plantilla pura (sin Node ni navegador); el render a PDF usa el Chromium compartido.
 */
import { formatDate, formatMoney } from "@agencyos/core";
import { geistFontCss } from "./fonts";
import { htmlToPdf } from "./render";

export type ClientReportPdfDoc = {
  brand: { name: string; initials: string; email: string | null; phone: string | null; website: string | null };
  clientName: string;
  periodLabel: string;
  generatedOn: string;
  projects: { name: string; status: string; progress: number; done: string[]; doneCount: number; nextAction: string | null }[];
  deliverables: { title: string; project: string; status: string; date: string | null }[];
  minutes: number;
  retainers: { concept: string; amount: string; currency: string; hoursIncluded: string | null; minutesUsed: number | null }[];
  sites: {
    name: string;
    url: string | null;
    uptimePct: number | null;
    checks: number;
    sslExpires: string | null;
    seoScore: number | null;
    seoDate: string | null;
  }[];
  domains: { name: string; expiresOn: string | null }[];
};

const esc = (s: string | number | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const hours = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

const CSS = `
:root { --ink:#111114; --muted:#55565e; --faint:#8a8b93; --rule:#d9d9de; --soft:#f4f4f6; --accent:#A9471F; }
* { box-sizing:border-box; }
html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { margin:0; color:var(--ink); font-family:"Geist", ui-sans-serif, system-ui, sans-serif; font-size:10pt; line-height:1.5; }
h1 { font-size:24pt; line-height:1.15; margin:8px 0 6px; font-weight:600; letter-spacing:-0.015em; }
h2 { font-size:13pt; margin:24px 0 10px; font-weight:600; display:flex; gap:10px; align-items:baseline; break-after:avoid; }
h2 .idx { font-size:9pt; color:var(--faint); font-weight:500; letter-spacing:0.08em; }
h3 { font-size:10.5pt; margin:0 0 4px; font-weight:600; }
p { margin:0 0 6px; }
.eyebrow { font-size:8pt; letter-spacing:0.18em; text-transform:uppercase; color:var(--muted); }
.rule { height:2px; width:44px; background:var(--accent); border-radius:2px; margin:0 0 12px; }
.muted { color:var(--muted); }
.num { font-variant-numeric:tabular-nums; white-space:nowrap; }
.facts { display:grid; grid-template-columns:repeat(3,1fr); border:1px solid var(--ink); border-radius:10px; margin-top:16px; overflow:hidden; }
.facts > div { padding:12px 14px; border-left:1px solid var(--rule); }
.facts > div:first-child { border-left:0; }
.facts .k { font-size:7.5pt; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted); }
.facts .v { font-size:14pt; font-weight:600; margin-top:3px; }
.card { border:1px solid var(--rule); border-radius:10px; padding:12px 14px; margin-bottom:10px; break-inside:avoid; }
.bar { height:6px; border-radius:3px; background:var(--soft); border:0.5px solid var(--rule); overflow:hidden; margin:6px 0 8px; }
.bar > div { height:100%; background:var(--ink); }
ul { margin:4px 0 0; padding-left:16px; }
li { margin:2px 0; }
table { width:100%; border-collapse:collapse; font-size:9pt; }
th { text-align:left; font-size:7.5pt; letter-spacing:0.14em; text-transform:uppercase; color:var(--muted); font-weight:500; padding:0 6px 6px; border-bottom:1.5px solid var(--ink); }
td { padding:6px; border-bottom:1px solid var(--rule); vertical-align:top; }
tr { break-inside:avoid; }
.r { text-align:right; }
.contact { margin-top:22px; border-top:1px solid var(--rule); padding-top:10px; font-size:9pt; color:var(--muted); }
@page { size:A4; margin:18mm; }
`;

export function renderClientReportHtml(doc: ClientReportPdfDoc, opts: { fontCss?: string } = {}): string {
  let idx = 0;
  const h2 = (t: string) => `<h2><span class="idx">${String(++idx).padStart(2, "0")}</span>${esc(t)}</h2>`;
  const doneTotal = doc.projects.reduce((a, p) => a + p.doneCount, 0);
  const sections: string[] = [];

  if (doc.projects.length) {
    sections.push(
      h2("Proyectos") +
        doc.projects
          .map(
            (p) => `<div class="card"><h3>${esc(p.name)}</h3><p class="muted">${esc(p.status)} · avance ${p.progress}%</p>
<div class="bar"><div style="width:${Math.max(0, Math.min(100, p.progress))}%"></div></div>
${p.done.length ? `<p><b>Lo que se hizo este mes</b>${p.doneCount > p.done.length ? ` (${p.doneCount}, los últimos ${p.done.length})` : ""}:</p><ul>${p.done.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : '<p class="muted">Sin tareas cerradas este mes.</p>'}
${p.nextAction ? `<p style="margin-top:8px"><b>Lo que sigue:</b> ${esc(p.nextAction)}</p>` : ""}</div>`,
          )
          .join(""),
    );
  }
  if (doc.deliverables.length) {
    sections.push(
      `${h2("Entregas")}<table><thead><tr><th>Entrega</th><th>Proyecto</th><th>Estado</th><th class="r">Fecha</th></tr></thead><tbody>${doc.deliverables
        .map((d) => `<tr><td>${esc(d.title)}</td><td>${esc(d.project)}</td><td>${esc(d.status)}</td><td class="r num">${esc(formatDate(d.date))}</td></tr>`)
        .join("")}</tbody></table>`,
    );
  }
  if (doc.retainers.length) {
    sections.push(
      `${h2("Abonos del mes")}<table><thead><tr><th>Servicio</th><th class="r">Horas</th><th class="r">Monto</th></tr></thead><tbody>${doc.retainers
        .map((r) => {
          const inc = r.hoursIncluded ? Math.round(Number(r.hoursIncluded) * 60) : 0;
          const used = r.minutesUsed ?? 0;
          return `<tr><td>${esc(r.concept)}</td><td class="r num">${inc ? `${esc(hours(used))} de ${esc(hours(inc))}` : "—"}</td><td class="r num">${esc(formatMoney(r.amount, r.currency))}</td></tr>`;
        })
        .join("")}</tbody></table>`,
    );
  }
  if (doc.sites.length) {
    sections.push(
      `${h2("Sitios web")}<table><thead><tr><th>Sitio</th><th class="r">Disponibilidad</th><th class="r">Certificado SSL</th><th class="r">SEO</th></tr></thead><tbody>${doc.sites
        .map(
          (s) =>
            `<tr><td>${esc(s.name)}${s.url ? `<br><span class="muted">${esc(s.url.replace(/^https?:\/\//, ""))}</span>` : ""}</td><td class="r num">${s.uptimePct === null ? "—" : `${esc(String(s.uptimePct).replace(".", ","))} %`}</td><td class="r num">${s.sslExpires ? `vence ${esc(formatDate(s.sslExpires))}` : "—"}</td><td class="r num">${s.seoScore === null ? "—" : `${s.seoScore}/100`}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table><p class="muted" style="font-size:8.5pt;margin-top:4px">Disponibilidad medida cada 5 minutos durante el mes. SEO: puntaje de la última auditoría.</p>`,
    );
  }
  if (doc.domains.length) {
    sections.push(
      `${h2("Dominios")}<table><thead><tr><th>Dominio</th><th class="r">Vencimiento</th></tr></thead><tbody>${doc.domains
        .map((d) => `<tr><td>${esc(d.name)}</td><td class="r num">${esc(formatDate(d.expiresOn))}</td></tr>`)
        .join("")}</tbody></table>`,
    );
  }
  const contact = [doc.brand.email, doc.brand.phone, doc.brand.website]
    .filter(Boolean)
    .map((x) => esc(x))
    .join(" · ");
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>Informe ${esc(doc.periodLabel)} · ${esc(doc.clientName)}</title>
<style>${opts.fontCss ?? ""}${CSS}</style></head><body>
<p class="eyebrow">Informe mensual · ${esc(doc.clientName)}</p>
<div class="rule"></div>
<h1>${esc(doc.periodLabel)}</h1>
<p class="muted">Preparado por ${esc(doc.brand.name)} el ${esc(formatDate(doc.generatedOn))}.</p>
<div class="facts">
  <div><div class="k">Tareas cerradas</div><div class="v num">${doneTotal}</div></div>
  <div><div class="k">Horas dedicadas</div><div class="v num">${esc(hours(doc.minutes))}</div></div>
  <div><div class="k">Proyectos activos</div><div class="v num">${doc.projects.length}</div></div>
</div>
${sections.join("\n") || '<p class="muted" style="margin-top:18px">Sin actividad registrada en el período.</p>'}
<p class="contact">¿Dudas sobre este informe? ${contact || esc(doc.brand.name)}</p>
</body></html>`;
}

export async function renderClientReportPdf(doc: ClientReportPdfDoc): Promise<Buffer> {
  const fontCss = geistFontCss();
  const html = renderClientReportHtml(doc, { fontCss });
  const base = `<style>${fontCss}</style><style>*{font-family:"Geist",ui-sans-serif,system-ui,sans-serif;-webkit-print-color-adjust:exact;}</style>`;
  const header = `${base}<div style="width:100%;padding:0 18mm;display:flex;align-items:center;justify-content:space-between;font-size:7.5pt;color:#55565e;">
    <span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border:0.8px solid #111114;border-radius:4px;font-size:6pt;font-weight:600;color:#111114;">${esc(doc.brand.initials)}</span><span style="color:#111114;font-weight:600;">${esc(doc.brand.name)}</span></span>
    <span>Informe · ${esc(doc.clientName)} · ${esc(doc.periodLabel)}</span></div>`;
  const footer = `${base}<div style="width:100%;padding:0 18mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#55565e;">
    <span>${esc(doc.brand.name)} · ${esc(formatDate(doc.generatedOn))}</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`;
  return htmlToPdf(html, { headerTemplate: header, footerTemplate: footer });
}
