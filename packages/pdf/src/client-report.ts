/**
 * Informe mensual para el cliente: A4, papelería común (Inter + Source Serif), la marca de la agencia (Luciano Rosano) y solo las secciones con datos.
 * Plantilla pura (sin Node ni navegador); el render a PDF usa el Chromium compartido.
 */
import { formatDate, formatMoney } from "@agencyos/core";
import { docFontCss } from "./fonts";
import { esc, letterhead, PAPER_CSS, pageChrome, sectionCounter } from "./paper";
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

const hours = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

const CSS = `
.hero { margin:40px 0 0; }
.hero .rule { height:2pt; width:46px; background:var(--accent); margin:0 0 14px; }
.card h3 { font-family:var(--serif); font-size:12pt; font-weight:600; }
.card .bar { margin:7px 0 9px; }
.card ul { margin-top:2px; }
.card li::marker { color:var(--accent); }
`;

export function renderClientReportHtml(doc: ClientReportPdfDoc, opts: { fontCss?: string } = {}): string {
  const h2 = sectionCounter();
  const doneTotal = doc.projects.reduce((a, p) => a + p.doneCount, 0);
  const sections: string[] = [];

  if (doc.projects.length) {
    sections.push(
      h2("Proyectos") +
        doc.projects
          .map(
            (p) => `<div class="card"><h3>${esc(p.name)}</h3><p class="muted">${esc(p.status)} · avance ${p.progress}%</p>
<div class="bar"><i style="width:${Math.max(0, Math.min(100, p.progress))}%"></i></div>
${p.done.length ? `<p><b>Lo que se hizo este mes</b>${p.doneCount > p.done.length ? ` (${p.doneCount}, los últimos ${p.done.length})` : ""}:</p><ul>${p.done.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : '<p class="muted">Sin tareas cerradas este mes.</p>'}
${p.nextAction ? `<p style="margin-top:8px"><b>Lo que sigue:</b> ${esc(p.nextAction)}</p>` : ""}</div>`,
          )
          .join(""),
    );
  }
  if (doc.deliverables.length) {
    sections.push(
      `${h2("Entregas")}<table class="t"><thead><tr><th>Entrega</th><th>Proyecto</th><th>Estado</th><th class="r">Fecha</th></tr></thead><tbody>${doc.deliverables
        .map((d) => `<tr><td>${esc(d.title)}</td><td>${esc(d.project)}</td><td>${esc(d.status)}</td><td class="r num">${esc(formatDate(d.date))}</td></tr>`)
        .join("")}</tbody></table>`,
    );
  }
  if (doc.retainers.length) {
    sections.push(
      `${h2("Abonos del mes")}<table class="t"><thead><tr><th>Servicio</th><th class="r">Horas</th><th class="r">Monto</th></tr></thead><tbody>${doc.retainers
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
      `${h2("Sitios web")}<table class="t"><thead><tr><th>Sitio</th><th class="r">Disponibilidad</th><th class="r">Certificado SSL</th><th class="r">SEO</th></tr></thead><tbody>${doc.sites
        .map(
          (s) =>
            `<tr><td>${esc(s.name)}${s.url ? `<br><span class="muted">${esc(s.url.replace(/^https?:\/\//, ""))}</span>` : ""}</td><td class="r num">${s.uptimePct === null ? "—" : `${esc(String(s.uptimePct).replace(".", ","))} %`}</td><td class="r num">${s.sslExpires ? `vence ${esc(formatDate(s.sslExpires))}` : "—"}</td><td class="r num">${s.seoScore === null ? "—" : `${s.seoScore}/100`}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table><p class="muted small" style="margin-top:6px">Disponibilidad medida cada 5 minutos durante el mes. SEO: puntaje de la última auditoría.</p>`,
    );
  }
  if (doc.domains.length) {
    sections.push(
      `${h2("Dominios")}<table class="t"><thead><tr><th>Dominio</th><th class="r">Vencimiento</th></tr></thead><tbody>${doc.domains
        .map((d) => `<tr><td>${esc(d.name)}</td><td class="r num">${esc(formatDate(d.expiresOn))}</td></tr>`)
        .join("")}</tbody></table>`,
    );
  }
  const contact = [doc.brand.email, doc.brand.phone, doc.brand.website]
    .filter(Boolean)
    .map((x) => esc(x))
    .join(" · ");
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>Informe ${esc(doc.periodLabel)} · ${esc(doc.clientName)}</title>
<style>${opts.fontCss ?? ""}${PAPER_CSS}${CSS}</style></head><body>
${letterhead(doc.brand, { large: true, sub: "Informe para clientes" })}
<div class="hero">
<div class="rule"></div>
<p class="eyebrow">Informe mensual · ${esc(doc.clientName)}</p>
<h1>${esc(doc.periodLabel)}</h1>
<p class="muted">Preparado por ${esc(doc.brand.name)} el <span class="num">${esc(formatDate(doc.generatedOn))}</span>.</p>
</div>
<div class="facts" style="--cols:3">
  <div><div class="k">Tareas cerradas</div><div class="v big num">${doneTotal}</div></div>
  <div><div class="k">Horas dedicadas</div><div class="v big num">${esc(hours(doc.minutes))}</div></div>
  <div><div class="k">Proyectos activos</div><div class="v big num">${doc.projects.length}</div></div>
</div>
${sections.join("\n") || '<p class="note" style="margin-top:18px">Sin actividad registrada en el período.</p>'}
<p class="closing"><span>¿Dudas sobre este informe? ${contact || esc(doc.brand.name)}</span><span class="num">${esc(doc.periodLabel)}</span></p>
</body></html>`;
}

export async function renderClientReportPdf(doc: ClientReportPdfDoc): Promise<Buffer> {
  const fontCss = docFontCss();
  const html = renderClientReportHtml(doc, { fontCss });
  const { header, footer } = pageChrome({
    brand: doc.brand,
    fontCss,
    right: `Informe · ${esc(doc.clientName)} · ${esc(doc.periodLabel)}`,
    footerLeft: `${esc(doc.brand.name)} · ${esc(formatDate(doc.generatedOn))}`,
  });
  return htmlToPdf(html, { headerTemplate: header, footerTemplate: footer });
}
