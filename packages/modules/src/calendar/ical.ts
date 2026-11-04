import { addDays, TZ } from "@agencyos/core";
import { type CalendarItem, sourceMeta } from "./sources";

/**
 * Exportación iCalendar (RFC 5545) escrita a mano, sin dependencias.
 * - Líneas terminadas en CRLF y plegadas a 75 octetos.
 * - Eventos de día completo con `VALUE=DATE` (DTEND exclusivo = día siguiente).
 * - Eventos con hora en `TZID=America/Buenos_Aires` (VTIMEZONE incluido; UTC-3 fijo, sin horario de verano).
 * - UID estable por ítem (tipo + id) para que el celular actualice en vez de duplicar.
 */

const CRLF = "\r\n";

/** Escapa TEXT (RFC 5545 §3.3.11). */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Pliega una línea a 75 octetos (UTF-8), sin cortar caracteres multibyte (RFC 5545 §3.1). */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // las continuaciones empiezan con un espacio
    }
    current += ch;
    bytes += n;
  }
  if (current) parts.push(current);
  return parts.join(`${CRLF} `);
}

const ymd = (iso: string) => iso.replaceAll("-", "");
const hm = (t: string) => t.replace(":", "").padEnd(4, "0");

function utcStamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const total = h * 60 + m + minutes;
  const dayShift = Math.floor(total / 1440);
  const rem = ((total % 1440) + 1440) % 1440;
  return { date: addDays(date, dayShift), time: `${String(Math.floor(rem / 60)).padStart(2, "0")}:${String(rem % 60).padStart(2, "0")}` };
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:-0300",
  "TZOFFSETTO:-0300",
  "TZNAME:-03",
  "END:STANDARD",
  "END:VTIMEZONE",
];

export function buildIcs(items: CalendarItem[], opts: { baseUrl?: string; now?: Date; name?: string } = {}): string {
  const stamp = utcStamp(opts.now ?? new Date());
  const base = opts.baseUrl?.replace(/\/$/, "");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AGENCYOS//Calendario//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.name ?? "AGENCYOS")}`,
    `X-WR-TIMEZONE:${TZ}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...VTIMEZONE,
  ];
  for (const it of items) {
    const kind = sourceMeta(it.source).label;
    lines.push("BEGIN:VEVENT", `UID:${it.key}@agencyos`, `DTSTAMP:${stamp}`);
    if (it.time && /^\d{2}:\d{2}/.test(it.time)) {
      const start = it.time.slice(0, 5);
      const end = addMinutes(it.date, start, 60);
      lines.push(`DTSTART;TZID=${TZ}:${ymd(it.date)}T${hm(start)}00`, `DTEND;TZID=${TZ}:${ymd(end.date)}T${hm(end.time)}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd(it.date)}`, `DTEND;VALUE=DATE:${ymd(addDays(it.date, 1))}`, "TRANSP:TRANSPARENT");
    }
    lines.push(`SUMMARY:${escapeText(it.title)}`);
    lines.push(`DESCRIPTION:${escapeText([kind, it.subtitle].filter(Boolean).join(" · "))}`);
    lines.push(`CATEGORIES:${escapeText(kind)}`);
    if (base) lines.push(`URL:${base}${it.href}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}
