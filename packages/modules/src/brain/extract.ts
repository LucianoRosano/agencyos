/**
 * Extracción de texto para el Cerebro: PDF (pdf.js), Word .docx (XML dentro del ZIP), texto, Markdown, CSV, HTML y JSON.
 * Sin servicios externos. Los demás formatos (imágenes, planillas, zip) se indexan solo por nombre y descripción.
 */
const MAX_CHARS = 400_000;
const MAX_PDF_PAGES = 300;

export const EXTRACTABLE = /^(text\/|application\/(pdf|json|xml)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)/;

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

async function pdfText(buf: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const parts: string[] = [];
  let size = 0;
  try {
    for (let i = 1; i <= Math.min(doc.numPages, MAX_PDF_PAGES) && size < MAX_CHARS; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ("str" in it ? `${it.str}${it.hasEOL ? "\n" : ""}` : ""))
        .join("")
        .replace(/[ \t]+/g, " ");
      parts.push(text);
      size += text.length;
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return parts.join("\n\n");
}

async function docxText(buf: Buffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) return "";
  return decodeEntities(
    xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

/** Texto plano del archivo (recortado a 400.000 caracteres) o "" si el formato no se puede leer. */
export async function extractText(buf: Buffer, mime: string, name = ""): Promise<string> {
  let out = "";
  const lower = name.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) out = await pdfText(buf);
  else if (mime.includes("wordprocessingml") || lower.endsWith(".docx")) out = await docxText(buf);
  else if (mime === "text/html" || lower.endsWith(".html") || lower.endsWith(".htm")) out = htmlToText(buf.toString("utf8"));
  else if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml" || /\.(md|txt|csv|json|xml)$/.test(lower))
    out = buf.toString("utf8");
  return out
    .replaceAll("\u0000", "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CHARS);
}
