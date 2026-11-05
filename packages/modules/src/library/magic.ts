import { validation } from "@agencyos/core";

/**
 * Validación de archivos subidos (docs/08 §5): tipo real por magic bytes, nombres normalizados y SVG sanitizado.
 * Funciones puras (sin base ni storage) para poder testearlas en unidad.
 */

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const DEFAULT_QUOTA_MB = 5000;

export const FILE_KINDS = ["image", "logo", "document", "pdf", "video", "archive", "font", "other"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

type TypeDef = { mime: string; kind: FileKind; check: (b: Buffer) => boolean };

const startsWith = (b: Buffer, bytes: number[], offset = 0) => b.length >= offset + bytes.length && bytes.every((x, i) => b[offset + i] === x);
const ascii = (b: Buffer, s: string, offset = 0) => b.length >= offset + s.length && b.toString("latin1", offset, offset + s.length) === s;
const isZip = (b: Buffer) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]);
/** Busca una entrada por prefijo en el zip (nombres en los encabezados locales/centrales, en claro). */
const zipHas = (b: Buffer, prefix: string) => isZip(b) && b.includes(Buffer.from(prefix, "latin1"));
const ooxml = (dir: string) => (b: Buffer) => zipHas(b, "[Content_Types].xml") && zipHas(b, dir);

/** Texto UTF-8 válido, sin bytes nulos ni caracteres de control binarios. */
export function looksLikeText(b: Buffer): boolean {
  const sample = b.subarray(0, Math.min(b.length, 1024 * 1024));
  if (sample.includes(0)) return false;
  try {
    // stream:true tolera un carácter multibyte cortado al final de la muestra
    new TextDecoder("utf-8", { fatal: true }).decode(sample, { stream: sample.length < b.length });
  } catch {
    return false;
  }
  let ctl = 0;
  for (const c of sample.subarray(0, 8192)) if (c < 9 || (c > 13 && c < 32 && c !== 27)) ctl++;
  return ctl === 0;
}

function isSvg(b: Buffer): boolean {
  if (!looksLikeText(b)) return false;
  const head = b
    .toString("utf8", 0, Math.min(b.length, 4096))
    .replace(/^﻿/, "")
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .trimStart();
  return /^<svg[\s>]/i.test(head);
}

const TEXT: TypeDef = { mime: "text/plain; charset=utf-8", kind: "document", check: looksLikeText };

/** Extensión → tipo esperado. Si la extensión no coincide con el contenido real, se rechaza. */
export const TYPES: Record<string, TypeDef> = {
  png: { mime: "image/png", kind: "image", check: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { mime: "image/jpeg", kind: "image", check: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: "image/jpeg", kind: "image", check: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  gif: { mime: "image/gif", kind: "image", check: (b) => ascii(b, "GIF87a") || ascii(b, "GIF89a") },
  webp: { mime: "image/webp", kind: "image", check: (b) => ascii(b, "RIFF") && ascii(b, "WEBP", 8) },
  svg: { mime: "image/svg+xml", kind: "image", check: isSvg },
  pdf: { mime: "application/pdf", kind: "pdf", check: (b) => ascii(b, "%PDF-") },
  zip: { mime: "application/zip", kind: "archive", check: isZip },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "document", check: ooxml("word/") },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "document", check: ooxml("xl/") },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "document", check: ooxml("ppt/") },
  txt: TEXT,
  md: { ...TEXT, mime: "text/markdown; charset=utf-8" },
  csv: { ...TEXT, mime: "text/csv; charset=utf-8" },
  mp4: { mime: "video/mp4", kind: "video", check: (b) => ascii(b, "ftyp", 4) },
  webm: { mime: "video/webm", kind: "video", check: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]) },
  woff: { mime: "font/woff", kind: "font", check: (b) => ascii(b, "wOFF") },
  woff2: { mime: "font/woff2", kind: "font", check: (b) => ascii(b, "wOF2") },
  ttf: { mime: "font/ttf", kind: "font", check: (b) => startsWith(b, [0x00, 0x01, 0x00, 0x00]) || ascii(b, "true") },
  otf: { mime: "font/otf", kind: "font", check: (b) => ascii(b, "OTTO") },
};

export const ALLOWED_EXTENSIONS = Object.keys(TYPES);
/** Para el atributo `accept` del selector de archivos. */
export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

/** Tipos que se muestran en el navegador (inline). El resto se descarga. SVG nunca inline. */
export const INLINE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);
/** Imágenes de las que se genera miniatura WebP. */
export const THUMBABLE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]);

export const extOf = (name: string) => (name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "");

/**
 * Nombre normalizado: sin rutas, sin caracteres de control ni reservados, Unicode NFC,
 * espacios colapsados, extensión en minúsculas y como máximo 120 caracteres.
 */
export function normalizeFileName(raw: string): string {
  const base = (raw ?? "").split(/[/\\]/).pop() ?? "";
  let s = base
    .normalize("NFC")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: se eliminan a propósito
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/[<>:"|?*\\/]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s-]+/, "")
    .replace(/[.\s]+$/, "");
  const dot = s.lastIndexOf(".");
  let stem = dot > 0 ? s.slice(0, dot) : s;
  let ext = dot > 0 ? s.slice(dot + 1).toLowerCase() : "";
  if (!/^[a-z0-9]{1,8}$/.test(ext)) {
    stem = s;
    ext = "";
  }
  stem = stem.trim().slice(0, 120 - (ext ? ext.length + 1 : 0)).trim() || "archivo";
  s = ext ? `${stem}.${ext}` : stem;
  return s;
}

export type DetectedType = { ext: string; mime: string; kind: FileKind };

/** Valida que el contenido real coincida con la extensión declarada. Lanza un error de validación si no. */
export function detectType(name: string, data: Buffer): DetectedType {
  const ext = extOf(name);
  const def = TYPES[ext];
  if (!def) throw validation(`Tipo de archivo no permitido${ext ? ` (.${ext})` : ""}. Permitidos: ${ALLOWED_EXTENSIONS.join(", ")}.`, { file: "Tipo no permitido" });
  if (data.length === 0) throw validation("El archivo está vacío.", { file: "Vacío" });
  if (!def.check(data)) {
    const real = sniff(data);
    throw validation(`El contenido no es un .${ext} real${real ? ` (parece ${real})` : ""}. Se rechazó por seguridad.`, { file: "El tipo real no coincide" });
  }
  return { ext: ext === "jpeg" ? "jpg" : ext, mime: def.mime, kind: def.kind };
}

/** Describe qué parece ser un archivo (solo para el mensaje de error). */
export function sniff(b: Buffer): string | null {
  if (startsWith(b, [0x4d, 0x5a])) return "un ejecutable de Windows";
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) return "un ejecutable de Linux";
  for (const [ext, def] of Object.entries(TYPES)) {
    if (def === TEXT || ext === "md" || ext === "csv" || ext === "txt") continue;
    if (["docx", "xlsx", "pptx"].includes(ext)) continue;
    if (def.check(b)) return `un .${ext}`;
  }
  if (looksLikeText(b)) return "texto";
  return null;
}

// --- SVG ---

const DROP_WITH_CONTENT = new Set(["script", "foreignobject", "iframe", "object", "embed", "handler", "listener", "noscript", "meta", "link", "base"]);
const URL_ATTRS = new Set(["href", "xlink:href", "src", "action", "formaction", "data"]);
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]*$/i;

function safeUrl(v: string) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: espacios/controles usados para ofuscar "javascript:"
  const s = v.replace(/[\u0000- ]+/g, "").toLowerCase();
  return s.startsWith("#") || SAFE_DATA_IMAGE.test(v.trim());
}

function decodeEntities(v: string) {
  return v
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n");
}

function cleanStyle(css: string) {
  // sin @import, url() externas, expression() ni javascript:
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "(")
    .replace(/javascript:/gi, "")
    .replace(/url\(\s*(['"]?)(?!#|data:image\/(png|jpe?g|gif|webp);)[^)]*\)/gi, "none");
}

/**
 * Sanitiza un SVG con una lista negra estricta: quita <script>, <foreignObject>, elementos embebidos,
 * atributos on*, URLs que no sean anclas internas o imágenes data:, DOCTYPE/ENTITY (XXE) y CSS peligroso.
 * Además, el SVG siempre se sirve como descarga con CSP `sandbox` (defensa en profundidad).
 */
export function sanitizeSvg(input: string): string {
  let s = input
    .replace(/^﻿/, "")
    .replace(/<!DOCTYPE[\s\S]*?(\[[\s\S]*?\])?\s*>/gi, "")
    .replace(/<!ENTITY[\s\S]*?>/gi, "")
    .replace(/<\?(?!xml\s)[\s\S]*?\?>/gi, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, inner: string) => inner.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c));
  const decl = /^\s*(<\?xml\s[^?]*\?>)/.exec(s);
  if (decl) s = s.slice(decl[0].length);
  let out = decl?.[1] ?? "";
  const tagRe = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let last = 0;
  let skipUntil: string | null = null;
  let skipDepth = 0;
  for (let m = tagRe.exec(s); m; m = tagRe.exec(s)) {
    const [whole, closing, rawName, attrs, selfClose] = m;
    const between = s.slice(last, m.index);
    last = m.index + whole.length;
    if (whole.startsWith("<!--")) {
      if (!skipUntil) out += between;
      continue;
    }
    const name = (rawName ?? "").toLowerCase();
    const local = name.includes(":") ? (name.split(":").pop() ?? name) : name;
    if (skipUntil) {
      if (local === skipUntil) {
        if (closing) skipDepth--;
        else if (!selfClose) skipDepth++;
        if (skipDepth === 0) skipUntil = null;
      }
      continue;
    }
    out += between.replace(/</g, "&lt;");
    if (DROP_WITH_CONTENT.has(local)) {
      if (!closing && !selfClose) {
        skipUntil = local;
        skipDepth = 1;
      }
      continue;
    }
    if (closing) {
      out += `</${rawName}>`;
      continue;
    }
    const kept: string[] = [];
    const attrRe = /([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    for (let a = attrRe.exec(attrs ?? ""); a; a = attrRe.exec(attrs ?? "")) {
      const an = (a[1] ?? "").toLowerCase();
      const av = a[3] ?? a[4] ?? a[5] ?? "";
      if (an.startsWith("on")) continue;
      const decoded = decodeEntities(av);
      if (URL_ATTRS.has(an) || an.endsWith(":href")) {
        if (!safeUrl(decoded)) continue;
      }
      if (/javascript:|vbscript:|data:text\/html/i.test(decoded.replace(/\s+/g, ""))) continue;
      const val = an === "style" ? cleanStyle(decoded) : decoded;
      kept.push(`${a[1]}="${val.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"`);
    }
    out += `<${rawName}${kept.length ? ` ${kept.join(" ")}` : ""}${selfClose ? "/" : ""}>`;
  }
  if (!skipUntil) out += s.slice(last).replace(/</g, "&lt;");
  s = out;
  // <style> con contenido peligroso
  s = s.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, a: string, css: string, c: string) => a + cleanStyle(css) + c);
  return s;
}
