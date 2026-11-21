import { type BriefDoc, briefHeaderFooter, renderBriefHtml } from "./brief-html";
import { docFontCss } from "./fonts";
import { htmlToPdf } from "./render";

export type { BriefDoc, BriefDocRow } from "./brief-html";
export { renderBriefHtml } from "./brief-html";

/** PDF del briefing del sitio: A4, Inter y Source Serif embebidas, marca hacia el cliente en encabezado y pie. */
export async function renderBriefPdf(doc: BriefDoc): Promise<Buffer> {
  const fontCss = docFontCss();
  const html = renderBriefHtml(doc, { fontCss });
  const { header, footer } = briefHeaderFooter(doc, fontCss);
  return htmlToPdf(html, { headerTemplate: header, footerTemplate: footer });
}
