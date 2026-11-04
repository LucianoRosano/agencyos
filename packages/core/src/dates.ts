/** Fechas en la zona de Argentina (America/Buenos_Aires, UTC-3 sin horario de verano). */
export const TZ = "America/Buenos_Aires";

const partsFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Fecha de calendario de hoy en Argentina, "YYYY-MM-DD". */
export function todayAR(now: Date = new Date()): string {
  return partsFmt.format(now);
}

export function toISODateAR(d: Date): string {
  return partsFmt.format(d);
}

/** Suma días a una fecha "YYYY-MM-DD" (aritmética de calendario pura, sin TZ). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  const pa = Date.parse(`${a}T00:00:00Z`);
  const pb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((pa - pb) / 86_400_000);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  return addDays(addMonths(startOfMonth(iso), 1), -1);
}

const DOW = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DOW_SHORT = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTHS_SHORT = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export function dayOfWeek(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}
export const dowName = (iso: string) => DOW[dayOfWeek(iso)] ?? "";
export const dowShort = (iso: string) => DOW_SHORT[dayOfWeek(iso)] ?? "";
export const monthName = (m: number) => MONTHS[m - 1] ?? "";
export const monthShort = (m: number) => MONTHS_SHORT[m - 1] ?? "";

/** "dd/mm/aaaa" */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const s = typeof iso === "string" ? iso.slice(0, 10) : toISODateAR(iso);
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/** "dd/mm" */
export function formatDayMonth(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const timeFmt = new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
export function formatTime(d: Date): string {
  return timeFmt.format(d);
}

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${formatDate(d)} ${formatTime(d)}`;
}

/** Hora actual en Argentina (0–23). */
export function hourAR(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now)) % 24;
}

export function greeting(now: Date = new Date()): string {
  const h = hourAR(now);
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buen día";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

/** Semana ISO de una fecha. */
export function isoWeek(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = (d.getTime() - firstThursday.getTime()) / 86_400_000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/** "hace 2 d", "hoy", "en 3 d" */
export function relativeDays(iso: string, today = todayAR()): string {
  const n = diffDays(iso, today);
  if (n === 0) return "hoy";
  if (n === 1) return "mañana";
  if (n === -1) return "ayer";
  return n > 0 ? `en ${n} d` : `hace ${-n} d`;
}

export function relativeFromDate(d: Date | null | undefined, now = new Date()): string {
  if (!d) return "—";
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "recién";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return relativeDays(toISODateAR(d), todayAR(now));
}
