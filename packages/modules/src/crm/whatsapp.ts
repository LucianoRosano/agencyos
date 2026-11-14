/**
 * Parser puro del .txt de «Exportar chat» de WhatsApp (Android e iPhone, español e inglés).
 * Formatos de fecha dd/mm/aa y dd/mm/aaaa (mm/dd si el archivo lo deja claro), 12 h y 24 h,
 * mensajes multilínea, mensajes del sistema y multimedia omitida.
 */

export type WaMessage = {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM (24 h) */
  time: string;
  author: string;
  text: string;
  media: boolean;
};

export type WaChat = {
  messages: WaMessage[];
  participants: { name: string; count: number }[];
  from: string | null;
  to: string | null;
  days: number;
  /** Líneas que no se pudieron interpretar como inicio de mensaje ni continuación (antes del primer mensaje). */
  skipped: number;
};

// Marcas invisibles que WhatsApp mete (LRM, RLM, BOM, espacios finos/NBSP).
const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;
const SPACES = /[   ]/g;

// [12/03/24, 14:05:33] Nombre: texto  |  12/03/2024, 14:05 - Nombre: texto  |  3/12/24, 2:05 p. m. - Nombre: texto
const HEADER = /^\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([ap]\.?\s?m\.?)?\]?\s*(?:[-–]\s*)?(.*)$/i;

const MEDIA = [
  /^<?\s*multimedia omitid[oa]\s*>?$/i,
  /^<?\s*media omitted\s*>?$/i,
  /^(imagen|image|video|audio|sticker|gif|documento|document|archivo|contacto|contact card)\s+omitid[oa]$/i,
  /^(image|video|audio|sticker|gif|document|contact card)\s+omitted$/i,
  /^<adjunto:.*>$/i,
  /^<attached:.*>$/i,
];

export const isMediaText = (t: string) => MEDIA.some((r) => r.test(t.trim()));

type Raw = { d: number; m: number; y: number; hh: number; mm: number; ampm: string | null; rest: string };

function parseHeader(line: string): Raw | null {
  const x = line.match(HEADER);
  if (!x) return null;
  const [, a, b, y, hh, mm, , ap, rest] = x;
  const yy = Number(y);
  return {
    d: Number(a),
    m: Number(b),
    y: yy < 100 ? 2000 + yy : yy,
    hh: Number(hh),
    mm: Number(mm),
    ampm: ap ? (ap.toLowerCase().startsWith("p") ? "pm" : "am") : null,
    rest: rest ?? "",
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Divide «Autor: texto». Sin «: » es un mensaje del sistema (cifrado, cambios de grupo, etc.). */
function splitAuthor(rest: string): { author: string; text: string } | null {
  const i = rest.indexOf(": ");
  if (i <= 0) {
    // «Autor:» con mensaje vacío (p. ej. multimedia en la línea siguiente)
    if (rest.endsWith(":") && rest.length > 1 && rest.length <= 80) return { author: rest.slice(0, -1).trim(), text: "" };
    return null;
  }
  const author = rest.slice(0, i).trim();
  if (!author || author.length > 80) return null;
  return { author, text: rest.slice(i + 2) };
}

export function parseWhatsappChat(input: string): WaChat {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const raws: (Raw & { author: string | null; text: string })[] = [];
  let skipped = 0;
  for (const original of lines) {
    const line = original.replace(INVISIBLE, "").replace(SPACES, " ");
    const h = parseHeader(line.trim());
    if (h) {
      const sa = splitAuthor(h.rest);
      raws.push({ ...h, author: sa?.author ?? null, text: sa ? sa.text : h.rest });
      continue;
    }
    const last = raws[raws.length - 1];
    if (last) last.text = last.text ? `${last.text}\n${line}` : line;
    else if (line.trim()) skipped++;
  }

  // Orden de fecha: dd/mm salvo que algún encabezado lo contradiga (segundo número > 12).
  const monthFirst = raws.some((r) => r.m > 12) && !raws.some((r) => r.d > 12);

  const messages: WaMessage[] = [];
  for (const r of raws) {
    if (!r.author) continue; // sistema
    const day = monthFirst ? r.m : r.d;
    const month = monthFirst ? r.d : r.m;
    if (!validDate(r.y, month, day)) continue;
    let hh = r.hh;
    if (r.ampm === "pm" && hh < 12) hh += 12;
    if (r.ampm === "am" && hh === 12) hh = 0;
    if (hh > 23 || r.mm > 59) continue;
    const text = r.text.replace(/\s+$/g, "");
    const media = isMediaText(text);
    messages.push({ date: `${r.y}-${pad(month)}-${pad(day)}`, time: `${pad(hh)}:${pad(r.mm)}`, author: r.author, text: media ? "" : text, media });
  }

  const counts = new Map<string, number>();
  for (const m of messages) counts.set(m.author, (counts.get(m.author) ?? 0) + 1);
  const participants = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const dates = [...new Set(messages.map((m) => m.date))].sort();
  return { messages, participants, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, days: dates.length, skipped };
}

/** Agrupa por día (orden cronológico). */
export function groupByDay(messages: WaMessage[]): { date: string; messages: WaMessage[] }[] {
  const map = new Map<string, WaMessage[]>();
  for (const m of messages) {
    const list = map.get(m.date) ?? [];
    list.push(m);
    map.set(m.date, list);
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, messages: list.sort((a, b) => a.time.localeCompare(b.time)) }));
}

/** Escapa lo que el Markdown interpretaría como formato fuerte (encabezados, listas, HTML). */
function mdLine(s: string) {
  return s.replace(/</g, "&lt;").replace(/^(\s*)([#>*+-]|\d+\.)(\s)/, "$1\\$2$3");
}

/**
 * Transcripción en Markdown de un día. `me` es el participante que es Luciano (se muestra como `meLabel`).
 * Trunca a `max` caracteres agregando cuántos mensajes quedaron afuera.
 */
export function dayTranscript(day: { date: string; messages: WaMessage[] }, opts: { me?: string | null; meLabel?: string; max?: number } = {}) {
  const max = opts.max ?? 20_000;
  const others = [...new Set(day.messages.map((m) => m.author).filter((a) => a !== opts.me))];
  const media = day.messages.filter((m) => m.media).length;
  const head = `**Chat de WhatsApp** · ${day.messages.length} ${day.messages.length === 1 ? "mensaje" : "mensajes"}${others.length ? ` con ${others.join(", ")}` : ""}${media ? ` · ${media} multimedia` : ""}\n\n`;
  let out = head;
  let included = 0;
  for (const m of day.messages) {
    const who = m.author === opts.me ? (opts.meLabel ?? m.author) : m.author;
    const body = m.media ? "_[multimedia]_" : m.text.split("\n").map(mdLine).join("  \n");
    const line = `**${m.time} · ${mdLine(who)}:** ${body}\n\n`;
    if (out.length + line.length > max - 80) break;
    out += line;
    included++;
  }
  const left = day.messages.length - included;
  if (left > 0) out += `_… (truncado: ${left} ${left === 1 ? "mensaje más" : "mensajes más"})_\n`;
  return out.trimEnd();
}
