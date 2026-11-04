/**
 * Parseo puro de notas Markdown (sin dependencias ni acceso a la base):
 * wikilinks, menciones, frontmatter YAML simple, slugs y conteo de palabras.
 * Lo usan el servicio de notas, la exportación a Obsidian y los tests unitarios.
 */

export type Wikilink = {
  /** Título de la nota destino tal como se escribió (sin `.md` ni carpeta). */
  target: string;
  section: string | null;
  alias: string | null;
  embed: boolean;
  /** Posición del `[[` en el texto original. */
  index: number;
  raw: string;
};

export type MentionCandidate = {
  sigil: "@" | "#";
  /** Candidatos de nombre, del más largo al más corto (para resolver nombres de varias palabras). */
  candidates: string[];
  index: number;
};

export type Frontmatter = Record<string, FrontmatterValue>;
export type FrontmatterValue = string | number | boolean | null | string[];

const ATTACHMENT_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|pdf|mp3|mp4|webm|mov|wav|ogg|m4a|zip|docx?|xlsx?|pptx?|csv|canvas)$/i;

/** Normaliza para comparar nombres: minúsculas, sin tildes y con espacios colapsados (equivale a `f_search_norm`). */
export function normName(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Slug estable para URL/archivo: "Int. a la Programación" → "int-a-la-programacion". */
export function slugify(s: string): string {
  const base = normName(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "nota";
}

/** Reemplaza bloques de código (``` y ~~~) y código en línea por espacios, conservando las posiciones. */
export function maskCode(md: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return md.replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm, blank).replace(/`[^`\n]+`/g, blank);
}

/** `[[Nota]]`, `[[Nota|alias]]`, `[[Nota#Sección]]`, `[[Carpeta/Nota.md#Sección|alias]]` y `![[embebida]]`. Ignora adjuntos y código. */
export function parseWikilinks(md: string): Wikilink[] {
  const text = maskCode(md);
  const out: Wikilink[] = [];
  const re = /(!?)\[\[([^[\]\n]+?)\]\]/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const inner = (m[2] ?? "").replace(/\\\|/g, "|");
    const bar = inner.indexOf("|");
    const ref = bar >= 0 ? inner.slice(0, bar) : inner;
    const alias = bar >= 0 ? inner.slice(bar + 1).trim() || null : null;
    const hash = ref.indexOf("#");
    let target = (hash >= 0 ? ref.slice(0, hash) : ref).trim();
    const section = hash >= 0 ? ref.slice(hash + 1).trim() || null : null;
    if (ATTACHMENT_EXT.test(target)) continue;
    target = target.replace(/\.md$/i, "");
    if (target.includes("/")) target = target.split("/").pop()?.trim() ?? "";
    if (!target) continue; // [[#Sección]] apunta a la misma nota
    out.push({ target, section, alias, embed: m[1] === "!", index: m.index, raw: m[0] });
  }
  return out;
}

/** Texto sin wikilinks ni código (para buscar menciones de texto plano). */
export function maskLinksAndCode(md: string): string {
  return maskCode(md)
    .replace(/!?\[\[[^[\]\n]+?\]\]/g, (m) => " ".repeat(m.length))
    .replace(/\[[^\]\n]*\]\([^)\n]*\)/g, (m) => " ".repeat(m.length));
}

const WORD = /^[\p{L}\p{N}][\p{L}\p{N}_\-.'’&]*/u;

/**
 * Menciones `@Cliente` / `#Proyecto` (también `@[Nombre con espacios]`).
 * Sin corchetes, devuelve candidatos de 1 a `maxWords` palabras: el servicio elige el más largo que exista.
 * Exige inicio de línea, espacio o puntuación de apertura antes del símbolo (descarta emails, URLs y títulos `# `).
 */
export function parseMentions(md: string, maxWords = 5): MentionCandidate[] {
  const text = maskLinksAndCode(md);
  const out: MentionCandidate[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "@" && ch !== "#") continue;
    const prev = i > 0 ? (text[i - 1] ?? "") : "";
    if (prev && !/[\s([{"'«¿¡,;]/.test(prev)) continue;
    const rest = text.slice(i + 1, i + 1 + 200);
    if (rest.startsWith("[")) {
      const close = rest.indexOf("]");
      const name = close > 0 ? rest.slice(1, close).trim() : "";
      if (name && !name.includes("\n")) out.push({ sigil: ch, candidates: [name], index: i });
      continue;
    }
    const words: string[] = [];
    let pos = 0;
    while (words.length < maxWords) {
      const w = WORD.exec(rest.slice(pos));
      if (!w) break;
      words.push(w[0].replace(/[.'’&-]+$/u, ""));
      pos += w[0].length;
      if (rest[pos] !== " ") break;
      pos += 1;
    }
    const clean = words.filter(Boolean);
    if (!clean.length) continue;
    const candidates: string[] = [];
    for (let n = clean.length; n >= 1; n--) candidates.push(clean.slice(0, n).join(" "));
    out.push({ sigil: ch, candidates, index: i });
  }
  return out;
}

// --- Frontmatter YAML (subconjunto: clave: valor, listas en línea y en bloque) ---

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

function scalar(raw: string): FrontmatterValue {
  const v = raw.replace(/\s+#.*$/, "").trim();
  if (v === "" || v === "~" || v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v) && !/^0\d/.test(v)) return Number(v);
  if (v.startsWith("[") && v.endsWith("]")) {
    return v
      .slice(1, -1)
      .split(",")
      .map((x) => unquote(x))
      .filter((x) => x.length > 0);
  }
  return unquote(v);
}

/** Separa el bloque `---` inicial. Nunca lanza: si el YAML no es del subconjunto soportado, guarda el texto crudo. */
export function parseFrontmatter(md: string): { data: Frontmatter; body: string; hasFrontmatter: boolean } {
  const m = FM_RE.exec(md);
  if (!m) return { data: {}, body: md, hasFrontmatter: false };
  const data: Frontmatter = {};
  let listKey: string | null = null;
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const cur = data[listKey];
      const val = unquote(item[1] ?? "");
      if (val) data[listKey] = Array.isArray(cur) ? [...cur, val] : [val];
      continue;
    }
    const kv = /^([A-Za-z0-9_\-ÁÉÍÓÚáéíóúñÑ ]+?)\s*:\s*(.*)$/.exec(line);
    if (!kv || /^\s/.test(line)) continue; // mapas anidados: no soportados
    const key = (kv[1] ?? "").trim();
    const raw = kv[2] ?? "";
    if (raw.trim() === "") {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = scalar(raw);
      listKey = null;
    }
  }
  // listas vacías sin ítems → null
  for (const [k, v] of Object.entries(data)) if (Array.isArray(v) && v.length === 0) data[k] = null;
  return { data, body: md.slice(m[0].length), hasFrontmatter: true };
}

function quoteIfNeeded(s: string): string {
  return /^[\w\-./ ÁÉÍÓÚáéíóúñÑüÜ]+$/.test(s) && !/^(true|false|null|-?\d+(\.\d+)?)$/.test(s) && s.trim() === s ? s : JSON.stringify(s);
}

/** Serializa a un bloque `---` compatible con Obsidian (listas en bloque). */
export function stringifyFrontmatter(data: Frontmatter): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      lines.push(`${k}:`);
      for (const x of v) lines.push(`  - ${quoteIfNeeded(String(x))}`);
    } else if (v === null) lines.push(`${k}:`);
    else if (typeof v === "string") lines.push(`${k}: ${quoteIfNeeded(v)}`);
    else lines.push(`${k}: ${String(v)}`);
  }
  return lines.length ? `---\n${lines.join("\n")}\n---\n` : "";
}

const asList = (v: FrontmatterValue | undefined): string[] =>
  Array.isArray(v)
    ? v
    : typeof v === "string"
      ? v
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [];

/** Etiquetas del frontmatter (`tags`/`etiquetas`), en minúsculas y sin `#`. */
export function frontmatterTags(fm: Frontmatter): string[] {
  const raw = [...asList(fm.tags), ...asList(fm.tag), ...asList(fm.etiquetas)];
  const seen = new Set<string>();
  for (const t of raw) {
    const n = t.replace(/^#/, "").trim().toLowerCase().slice(0, 40);
    if (n) seen.add(n);
  }
  return [...seen];
}

/** Alias del frontmatter (`aliases`/`alias`). */
export function frontmatterAliases(fm: Frontmatter): string[] {
  return [...new Set([...asList(fm.aliases), ...asList(fm.alias)].map((a) => a.trim()).filter(Boolean))];
}

export function countWords(md: string): number {
  const body = parseFrontmatter(md).body;
  const m = body.replace(/[#>*_`~[\]()|-]/g, " ").match(/[\p{L}\p{N}]+/gu);
  return m ? m.length : 0;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Reescribe `[[Viejo…]]` → `[[Nuevo…]]` conservando sección y alias (renombrar una nota). */
export function renameWikilinks(md: string, oldTitle: string, newTitle: string): string {
  const old = normName(oldTitle);
  return md.replace(/(!?)\[\[([^[\]\n]+?)\]\]/g, (whole, bang: string, inner: string) => {
    const bar = inner.indexOf("|");
    const ref = bar >= 0 ? inner.slice(0, bar) : inner;
    const tail = bar >= 0 ? inner.slice(bar) : "";
    const hash = ref.indexOf("#");
    const target = hash >= 0 ? ref.slice(0, hash) : ref;
    const section = hash >= 0 ? ref.slice(hash) : "";
    const clean = target.replace(/\.md$/i, "").split("/").pop() ?? "";
    if (normName(clean) !== old) return whole;
    return `${bang}[[${newTitle}${section}${tail}]]`;
  });
}

/** ¿El texto menciona el título en texto plano (fuera de enlaces y código), como palabra completa? */
export function hasPlainMention(md: string, title: string): boolean {
  const t = normName(title);
  if (t.length < 3) return false;
  const hay = normName(maskLinksAndCode(parseFrontmatter(md).body));
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(t)}(?![\\p{L}\\p{N}])`, "u").test(hay);
}

/**
 * Convierte la primera mención en texto plano del título en `[[Título]]` (o `[[Título|texto]]` si difiere).
 * Devuelve null si no hay una mención enlazable.
 */
export function linkFirstPlainMention(md: string, title: string): string | null {
  const masked = maskLinksAndCode(md);
  const fm = parseFrontmatter(md);
  const start = fm.hasFrontmatter ? md.length - fm.body.length : 0;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(title)}(?![\\p{L}\\p{N}])`, "giu");
  for (let m = re.exec(masked); m; m = re.exec(masked)) {
    if (m.index < start) continue;
    const found = md.slice(m.index, m.index + m[0].length);
    const repl = found === title ? `[[${title}]]` : `[[${title}|${found}]]`;
    return md.slice(0, m.index) + repl + md.slice(m.index + m[0].length);
  }
  return null;
}

/** Nombre de archivo seguro para Obsidian/Windows. */
export function safeFileName(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|#^[\]]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "Sin título"
  );
}

/** Normaliza una ruta de carpeta: "/Facultad//PSEC/" → "Facultad/PSEC". Rechaza "..". */
export function normalizeFolder(path: string | null | undefined): string | null {
  if (!path) return null;
  const parts = path
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p && p !== "." && p !== "..");
  return parts.length ? parts.join("/").slice(0, 300) : null;
}
