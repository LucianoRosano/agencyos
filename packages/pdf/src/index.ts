import { docFontCss } from "./fonts";
import { pdfHeaderFooter, type QuoteDoc, renderQuoteHtml } from "./quote-html";
import { htmlToPdf } from "./render";

export { docFontBuffer, docFontCss, docFontCssFromUrl } from "./fonts";
export { mdToHtml, pdfHeaderFooter, type QuoteDoc, type QuoteDocItem, type QuoteDocPlanRow, renderQuoteHtml } from "./quote-html";
export { closeBrowser, htmlToPdf } from "./render";

/** PDF del presupuesto: A4, márgenes de 18 mm, Inter y Source Serif embebidas, encabezado con la marca y pie con página y fecha. */
export async function renderQuotePdf(doc: QuoteDoc): Promise<Buffer> {
  const fontCss = docFontCss();
  const html = renderQuoteHtml(doc, { fontCss });
  const { header, footer } = pdfHeaderFooter(doc, fontCss);
  return htmlToPdf(html, { headerTemplate: header, footerTemplate: footer });
}
