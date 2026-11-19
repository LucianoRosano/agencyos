import { addDays, addMonths, dayOfWeek, endOfMonth, todayAR } from "./dates";

/**
 * Fechas en lenguaje natural (español rioplatense) dentro de un texto:
 * «Llamar a Sofía mañana 10hs» → { date: mañana, time: "10:00", rest: "Llamar a Sofía" }.
 * Reconoce: hoy, mañana, pasado mañana, (el|este|próximo) lunes…domingo, la semana que viene, fin de mes,
 * en N días/semanas/meses, dd/mm[/aa(aa)], «15 de diciembre [de 2027]» y horas («a las 10», «10hs», «18:30», «9am»).
 * Puro y sin dependencias: se usa en el cliente y en el servidor.
 */
export type NaturalDate = { date: string | null; time: string | null; rest: string; matched: string[] };

const DAYS: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};
const NUM_WORDS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

/** Quita tildes conservando la longitud (para poder recortar el texto original con los mismos índices). */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const dt = new Date(`${iso}T12:00:00Z`);
  return dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d ? iso : null;
}

/** Fecha sin año: la próxima ocurrencia (hoy o después). */
function nextOccurrence(m: number, d: number, today: string): string | null {
  const y = Number(today.slice(0, 4));
  const thisYear = validDate(y, m, d);
  if (thisYear && thisYear >= today) return thisYear;
  return validDate(y + 1, m, d);
}

type Hit = { start: number; end: number; date?: string; time?: string };

export function parseNaturalDate(text: string, today: string = todayAR()): NaturalDate {
  // Trabajamos sobre una copia sin tildes; NFD puede cambiar longitudes, así que normalizamos el original a NFC antes.
  const original = text.normalize("NFC");
  const f = fold(original);
  if (f.length !== original.length) {
    // Caso raro (caracteres que se descomponen en más de un punto): sin recorte seguro, no tocar el texto.
    return { date: null, time: null, rest: original.trim(), matched: [] };
  }
  const hits: Hit[] = [];
  const take = (re: RegExp, fn: (m: RegExpExecArray) => Omit<Hit, "start" | "end"> | null) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null = re.exec(f);
    while (m) {
      const start = m.index;
      const end = start + m[0].length;
      if (!hits.some((h) => start < h.end && end > h.start)) {
        const r = fn(m);
        if (r) hits.push({ start, end, ...r });
      }
      m = re.exec(f);
    }
  };
  const b = "(?<![\\p{L}\\d])"; // borde izquierdo (no es parte de otra palabra)
  const e = "(?![\\p{L}\\d])";

  take(new RegExp(`${b}pasado\\s+manana${e}`, "gu"), () => ({ date: addDays(today, 2) }));
  take(new RegExp(`${b}(?:para\\s+)?manana${e}`, "gu"), () => ({ date: addDays(today, 1) }));
  take(new RegExp(`${b}(?:para\\s+)?hoy${e}`, "gu"), () => ({ date: today }));
  take(new RegExp(`${b}(?:para\\s+)?(?:a\\s+)?fin\\s+de\\s+mes${e}`, "gu"), () => ({ date: endOfMonth(today) }));
  take(new RegExp(`${b}(?:la\\s+)?(?:semana\\s+que\\s+viene|proxima\\s+semana)${e}`, "gu"), () => {
    // el lunes siguiente (nunca hoy)
    return { date: addDays(today, (1 - dayOfWeek(today) + 7) % 7 || 7) };
  });
  take(new RegExp(`${b}en\\s+(\\d{1,3}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\\s+(dias?|semanas?|mes(?:es)?)${e}`, "gu"), (m) => {
    const n = /^\d+$/.test(m[1] ?? "") ? Number(m[1]) : (NUM_WORDS[m[1] ?? ""] ?? 0);
    if (!n) return null;
    const unit = m[2] ?? "";
    if (unit.startsWith("dia")) return { date: addDays(today, n) };
    if (unit.startsWith("semana")) return { date: addDays(today, 7 * n) };
    return { date: addMonths(today, n) };
  });
  take(
    new RegExp(
      `${b}(?:(?:el|este|esta)\\s+|(?:el\\s+)?(?:proximo|proxima)\\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)(?:\\s+que\\s+viene)?${e}`,
      "gu",
    ),
    (m) => {
      const target = DAYS[m[1] ?? ""];
      if (target === undefined) return null;
      const whole = m[0];
      const dow = dayOfWeek(today);
      let delta = (target - dow + 7) % 7;
      if (/^(este|esta)\s/.test(whole)) return { date: addDays(today, delta) };
      if (delta === 0) delta = 7; // «el viernes» dicho un viernes = el de la semana próxima
      return { date: addDays(today, delta) };
    },
  );
  take(new RegExp(`${b}(?:el\\s+)?(\\d{1,2})\\s+de\\s+(${Object.keys(MONTHS).join("|")})(?:\\s+(?:de|del)\\s+(\\d{4}))?${e}`, "gu"), (m) => {
    const d = Number(m[1]);
    const mo = MONTHS[m[2] ?? ""] ?? 0;
    const date = m[3] ? validDate(Number(m[3]), mo, d) : nextOccurrence(mo, d, today);
    return date ? { date } : null;
  });
  take(new RegExp(`${b}(?:el\\s+)?(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?${e}`, "gu"), (m) => {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let date: string | null;
    if (m[3]) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      date = validDate(y, mo, d);
    } else date = nextOccurrence(mo, d, today);
    return date ? { date } : null;
  });
  // Horas: «a las 10», «a las 18:30», «10hs», «10 hs», «10.30 hs», «9am», «9 pm», «18:30»
  take(new RegExp(`${b}(?:a\\s+las?\\s+)(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:hs?|horas?|am|pm)?${e}`, "gu"), (m) => hourHit(m[1], m[2], m[0]));
  take(new RegExp(`${b}(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:hs|h|am|pm)${e}`, "gu"), (m) => hourHit(m[1], m[2], m[0]));
  take(new RegExp(`${b}(\\d{1,2}):(\\d{2})${e}`, "gu"), (m) => hourHit(m[1], m[2], m[0]));

  if (!hits.length) return { date: null, time: null, rest: original.trim(), matched: [] };
  const date = hits.find((h) => h.date)?.date ?? null;
  const time = hits.find((h) => h.time)?.time ?? null;
  // Si solo hay hora, la fecha es hoy.
  let rest = original;
  for (const h of [...hits].sort((a, c) => c.start - a.start)) rest = rest.slice(0, h.start) + " " + rest.slice(h.end);
  rest = rest
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/(?:^|\s)(?:para|el|a\s+las?)\s*$/i, "")
    .replace(/[\s,;:-]+$/g, "")
    .trim();
  return {
    date: date ?? (time ? today : null),
    time,
    rest: rest || original.trim(),
    matched: hits.sort((a, c) => a.start - c.start).map((h) => original.slice(h.start, h.end).trim()),
  };
}

function hourHit(hRaw: string | undefined, mRaw: string | undefined, whole: string): { time: string } | null {
  let h = Number(hRaw);
  const min = mRaw ? Number(mRaw) : 0;
  if (/pm/.test(whole) && h < 12) h += 12;
  if (/am/.test(whole) && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { time: `${pad(h)}:${pad(min)}` };
}
