import { geistFontCss } from "./fonts";
import { pdfHeaderFooter, type QuoteDoc, renderQuoteHtml } from "./quote-html";
import { htmlToPdf } from "./render";

export { closeBrowser, htmlToPdf } from "./render";
export { geistFontBuffer, geistFontCss, geistFontCssFromUrl } from "./fonts";
export { mdToHtml, pdfHeaderFooter, renderQuoteHtml, type QuoteDoc, type QuoteDocItem, type QuoteDocPlanRow } from "./quote-html";

/** PDF del presupuesto: A4, márgenes de 18 mm, Geist embebido, encabezado con la marca y pie con página y fecha. */
export async function renderQuotePdf(doc: QuoteDoc): Promise<Buffer> {
  const fontCss = geistFontCss();
  const html = renderQuoteHtml(doc, { fontCss });
  const { header, footer } = pdfHeaderFooter(doc, `<style>${fontCss}</style>`);
  return htmlToPdf(html, { headerTemplate: header, footerTemplate: footer });
}
