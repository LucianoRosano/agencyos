/**
 * Parser HTML liviano para el auditor SEO (sin dependencias).
 * Un tokenizador por regex recorre etiquetas y texto una sola vez y extrae lo que el auditor necesita:
 * title, meta (description, robots, viewport, Open Graph, Twitter), lang, h1–h6, enlaces, imágenes,
 * canonical, hreflang, JSON-LD, recursos (para mixed content) y conteo de palabras visibles.
 * No pretende construir un DOM: tolera HTML mal formado y nunca ejecuta nada.
 */

export type ParsedLink = { href: string; text: string; rel: string; nofollow: boolean };
export type ParsedImage = { src: string; alt: string | null };
export type ParsedHreflang = { lang: string; href: string };
export type ParsedJsonLd = { ok: true; types: string[]; data: unknown } | { ok: false; error: string };
export type ParsedResource = { tag: string; url: string };

export type ParsedPage = {
  title: string | null;
  titleCount: number;
  metaDescription: string | null;
  metaDescriptionCount: number;
  robotsMeta: string | null;
  viewport: string | null;
  lang: string | null;
  canonical: string | null;
  canonicalCount: number;
  headings: { level: number; text: string }[];
  h1: string[];
  links: ParsedLink[];
  images: ParsedImage[];
  hreflang: ParsedHreflang[];
  jsonLd: ParsedJsonLd[];
  og: Record<string, string>;
  twitter: Record<string, string>;
  resources: ParsedResource[];
  formActions: string[];
  baseHref: string | null;
  wordCount: number;
};

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  ntilde: "ñ",
  Ntilde: "Ñ",
  uuml: "ü",
  Uuml: "Ü",
  iexcl: "¡",
  iquest: "¿",
  copy: "©",
  reg: "®",
  laquo: "«",
  raquo: "»",
  middot: "·",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e] ?? m;
  });
}

const clean = (s: string) => decodeEntities(s).replace(/\s+/g, " ").trim();

const ATTR = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR)) {
    const name = (m[1] ?? "").toLowerCase();
    if (!name || name in out) continue;
    out[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

/** Comentarios, bloques de texto crudo (script/style/…) y etiquetas, en orden. */
const TOKEN = /<!--[\s\S]*?-->|<(script|style|noscript|template|textarea)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1\s*>|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>|<!doctype[^>]*>/gi;

const VOID = new Set(["br", "img", "meta", "link", "input", "hr", "source", "base", "area", "col", "embed", "param", "track", "wbr"]);

function words(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function parseHtml(html: string): ParsedPage {
  const p: ParsedPage = {
    title: null,
    titleCount: 0,
    metaDescription: null,
    metaDescriptionCount: 0,
    robotsMeta: null,
    viewport: null,
    lang: null,
    canonical: null,
    canonicalCount: 0,
    headings: [],
    h1: [],
    links: [],
    images: [],
    hreflang: [],
    jsonLd: [],
    og: {},
    twitter: {},
    resources: [],
    formActions: [],
    baseHref: null,
    wordCount: 0,
  };
  // Capturas de texto abiertas (title, h1–h6, a). Se cierran con su etiqueta de cierre.
  type Capture = { tag: string; buf: string[]; attrs: Record<string, string> };
  const open: Capture[] = [];
  let inHead = false;
  let inBody = false;
  let sawBody = false;
  const bodyText: string[] = [];
  let last = 0;

  const pushText = (raw: string) => {
    if (!raw) return;
    const t = decodeEntities(raw);
    for (const c of open) c.buf.push(t);
    if (!inHead || inBody) bodyText.push(t);
  };

  for (const m of html.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    pushText(html.slice(last, idx));
    last = idx + m[0].length;
    if (m[0].startsWith("<!")) continue;

    if (m[1]) {
      // bloque crudo
      const tag = m[1].toLowerCase();
      const attrs = parseAttrs(m[2] ?? "");
      const body = m[3] ?? "";
      if (tag === "script") {
        if (attrs.src) p.resources.push({ tag: "script", url: attrs.src });
        if ((attrs.type ?? "").toLowerCase().trim() === "application/ld+json") p.jsonLd.push(parseJsonLd(body));
      }
      if (tag === "textarea") pushText(body);
      continue;
    }

    const closing = m[4] === "/";
    const tag = (m[5] ?? "").toLowerCase();
    const attrs = closing ? {} : parseAttrs(m[6] ?? "");

    if (closing) {
      if (tag === "head") inHead = false;
      if (tag === "body") inBody = false;
      const i = findLastIndex(open, (c) => c.tag === tag);
      if (i >= 0) {
        const [c] = open.splice(i, 1);
        if (c) closeCapture(p, c);
      }
      // separa palabras entre bloques
      bodyText.push(" ");
      continue;
    }

    switch (tag) {
      case "html":
        if (attrs.lang !== undefined) p.lang = attrs.lang.trim() || null;
        break;
      case "head":
        inHead = true;
        break;
      case "body":
        inHead = false;
        inBody = true;
        sawBody = true;
        break;
      case "base":
        if (attrs.href && !p.baseHref) p.baseHref = attrs.href;
        break;
      case "title":
        if (!sawBody) open.push({ tag, buf: [], attrs });
        break;
      case "meta":
        onMeta(p, attrs);
        break;
      case "link":
        onLink(p, attrs);
        break;
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
      case "a":
        open.push({ tag, buf: [], attrs });
        break;
      case "img":
        p.images.push({ src: attrs.src ?? attrs["data-src"] ?? "", alt: "alt" in attrs ? (attrs.alt ?? "") : null });
        if (attrs.src) p.resources.push({ tag: "img", url: attrs.src });
        break;
      case "iframe":
      case "source":
      case "video":
      case "audio":
      case "embed":
        if (attrs.src) p.resources.push({ tag, url: attrs.src });
        break;
      case "form":
        if (attrs.action) p.formActions.push(attrs.action);
        break;
      default:
        break;
    }
    if (VOID.has(tag)) continue;
    bodyText.push(" ");
  }
  pushText(html.slice(last));
  // Etiquetas sin cerrar al final del documento.
  for (const c of open.splice(0)) closeCapture(p, c);
  p.wordCount = words(bodyText.join(""));
  return p;
}

function findLastIndex<T>(arr: T[], fn: (x: T) => boolean) {
  for (let i = arr.length - 1; i >= 0; i--) if (fn(arr[i] as T)) return i;
  return -1;
}

function closeCapture(p: ParsedPage, c: { tag: string; buf: string[]; attrs: Record<string, string> }) {
  const text = c.buf.join("").replace(/\s+/g, " ").trim();
  if (c.tag === "title") {
    p.titleCount++;
    if (p.title === null) p.title = text;
    return;
  }
  if (c.tag === "a") {
    const href = (c.attrs.href ?? "").trim();
    if (!href) return;
    const rel = (c.attrs.rel ?? "").toLowerCase();
    p.links.push({ href, text: text || (c.attrs["aria-label"] ?? c.attrs.title ?? ""), rel, nofollow: /\bnofollow\b/.test(rel) });
    return;
  }
  const level = Number(c.tag.slice(1));
  p.headings.push({ level, text });
  if (level === 1) p.h1.push(text);
}

function onMeta(p: ParsedPage, a: Record<string, string>) {
  const name = (a.name ?? "").toLowerCase().trim();
  const prop = (a.property ?? "").toLowerCase().trim();
  const content = clean(a.content ?? "");
  if (name === "description") {
    p.metaDescriptionCount++;
    if (p.metaDescription === null) p.metaDescription = content;
  } else if (name === "robots" || name === "googlebot") {
    p.robotsMeta = p.robotsMeta ? `${p.robotsMeta}, ${content}` : content;
  } else if (name === "viewport") {
    p.viewport = content;
  } else if (name.startsWith("twitter:")) {
    p.twitter[name] = content;
  }
  if (prop.startsWith("og:") && !(prop in p.og)) p.og[prop] = content;
}

function onLink(p: ParsedPage, a: Record<string, string>) {
  const rel = (a.rel ?? "").toLowerCase().split(/\s+/);
  const href = (a.href ?? "").trim();
  if (rel.includes("canonical")) {
    p.canonicalCount++;
    if (p.canonical === null) p.canonical = href;
  }
  if (rel.includes("alternate") && a.hreflang) p.hreflang.push({ lang: a.hreflang.trim(), href });
  if (rel.includes("stylesheet") && href) p.resources.push({ tag: "link", url: href });
}

export function parseJsonLd(raw: string): ParsedJsonLd {
  const text = raw
    .trim()
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .trim();
  try {
    const data = JSON.parse(text) as unknown;
    return { ok: true, types: jsonLdTypes(data), data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "JSON inválido" };
  }
}

function jsonLdTypes(d: unknown, out: string[] = []): string[] {
  if (Array.isArray(d)) {
    for (const x of d) jsonLdTypes(x, out);
  } else if (d && typeof d === "object") {
    const o = d as Record<string, unknown>;
    const t = o["@type"];
    if (typeof t === "string") out.push(t);
    else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") out.push(x);
    if (Array.isArray(o["@graph"])) jsonLdTypes(o["@graph"], out);
  }
  return out;
}

/** Valida un código hreflang: `x-default`, idioma ISO 639-1 y región ISO 3166-1 opcional (es, es-AR). */
export function isValidHreflang(code: string): boolean {
  return /^x-default$/i.test(code) || /^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?$/i.test(code);
}

/** Directivas de robots (meta o X-Robots-Tag) en minúsculas. */
export function robotsDirectives(...values: (string | null | undefined)[]): Set<string> {
  const s = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    for (const part of v.toLowerCase().split(/[,;]/)) {
      // X-Robots-Tag puede venir como "googlebot: noindex"
      const d = part.includes(":") ? part.split(":").pop() : part;
      const t = d?.trim();
      if (t) s.add(t);
    }
  }
  return s;
}
