/**
 * Motor puro de automatizaciones (M09): condiciones, plantillas {{ }}, cron en hora Argentina,
 * firma de webhooks con anti-replay e ids deterministas. Sin acceso a la base: 100 % testeable.
 */
import { createHash } from "node:crypto";
import { formatDate } from "@agencyos/core";
import { hmac, safeEqualHex } from "../shared/crypto";

export type ConditionOp = "eq" | "neq" | "contains" | "gt" | "lt" | "exists";
export type Condition = { field: string; op: ConditionOp; value?: string };
export type ConditionGroup = { match: "all" | "any"; items: Condition[] };

export const CONDITION_OPS: Record<ConditionOp, string> = {
  eq: "es igual a",
  neq: "no es igual a",
  contains: "contiene",
  gt: "es mayor que",
  lt: "es menor que",
  exists: "tiene valor",
};

// --- Lectura de rutas "a.b.c" ---
export function getPath(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const k of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLocaleLowerCase("es-AR");
const asNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return null;
};
const isIsoDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

/** Evalúa una condición. Comparación sin distinguir mayúsculas; números y fechas "YYYY-MM-DD" por orden. */
export function evaluateCondition(c: Condition, data: unknown): boolean {
  const v = getPath(data, c.field);
  switch (c.op) {
    case "exists":
      return !isEmpty(v);
    case "eq":
      if (typeof v === "boolean") return String(v) === norm(c.value);
      return norm(v) === norm(c.value);
    case "neq":
      if (typeof v === "boolean") return String(v) !== norm(c.value);
      return norm(v) !== norm(c.value);
    case "contains":
      if (Array.isArray(v)) return v.some((x) => norm(x) === norm(c.value));
      return norm(c.value) !== "" && norm(v).includes(norm(c.value));
    case "gt":
    case "lt": {
      if (isEmpty(v) || isEmpty(c.value)) return false;
      const a = asNumber(v);
      const b = asNumber(c.value);
      if (a !== null && b !== null) return c.op === "gt" ? a > b : a < b;
      if (isIsoDate(v) && isIsoDate(c.value)) {
        const sa = String(v).slice(0, 10);
        const sb = String(c.value).slice(0, 10);
        return c.op === "gt" ? sa > sb : sa < sb;
      }
      return false;
    }
    default:
      return false;
  }
}

export function evaluateConditions(
  group: ConditionGroup | null | undefined,
  data: unknown,
): { passed: boolean; details: { condition: Condition; passed: boolean }[] } {
  const items = group?.items ?? [];
  const details = items.map((condition) => ({ condition, passed: evaluateCondition(condition, data) }));
  if (!details.length) return { passed: true, details };
  const passed = group?.match === "any" ? details.some((d) => d.passed) : details.every((d) => d.passed);
  return { passed, details };
}

// --- Plantillas {{ entidad.campo }} ---
function show(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (v instanceof Date) return formatDate(v);
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(v) : v;
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(show).join(", ");
  return JSON.stringify(v);
}

/** Reemplaza `{{ ruta }}` por el valor del contexto. Lo desconocido queda vacío. Fechas en dd/mm/aaaa. */
export function interpolate(template: string, data: unknown): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, path: string) => show(getPath(data, path)));
}

/** Variables usadas en una plantilla (para validar y mostrar ayuda). */
export function templateVars(template: string): string[] {
  return [...template.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1] as string);
}

// --- Cron (5 campos) en hora Argentina ---
type CronFields = { minute: Set<number>; hour: Set<number>; dom: Set<number>; month: Set<number>; dow: Set<number>; domAny: boolean; dowAny: boolean };

function parseField(raw: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of raw.split(",")) {
    const [range, stepRaw] = part.split("/") as [string, string | undefined];
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Paso inválido: ${part}`);
    let lo: number;
    let hi: number;
    if (range === "*") {
      lo = min;
      hi = max;
    } else if (range.includes("-")) {
      const [a, b] = range.split("-").map(Number) as [number, number];
      lo = a;
      hi = b;
    } else {
      lo = Number(range);
      hi = stepRaw === undefined ? lo : max;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) throw new Error(`Valor fuera de rango: ${part}`);
    for (let i = lo; i <= hi; i += step) out.add(i === 7 && max === 7 ? 0 : i);
  }
  return out;
}

export function parseCron(expr: string): CronFields {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("El cron necesita 5 campos");
  const [mi, h, dom, mo, dow] = parts as [string, string, string, string, string];
  return {
    minute: parseField(mi, 0, 59),
    hour: parseField(h, 0, 23),
    dom: parseField(dom, 1, 31),
    month: parseField(mo, 1, 12),
    dow: parseField(dow, 0, 7),
    domAny: dom === "*",
    dowAny: dow === "*",
  };
}

export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

const arFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Buenos_Aires",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  weekday: "short",
  hourCycle: "h23",
});
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Partes de reloj en Argentina para un instante. */
export function arParts(d: Date) {
  const p = Object.fromEntries(arFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    dow: WD[p.weekday ?? "Sun"] ?? 0,
  };
}

export function cronMatches(expr: string | CronFields, at: Date): boolean {
  const c = typeof expr === "string" ? parseCron(expr) : expr;
  const p = arParts(at);
  if (!c.minute.has(p.minute) || !c.hour.has(p.hour) || !c.month.has(p.month)) return false;
  const domOk = c.dom.has(p.day);
  const dowOk = c.dow.has(p.dow);
  // semántica clásica: si ambos están restringidos, alcanza con uno
  if (!c.domAny && !c.dowAny) return domOk || dowOk;
  return domOk && dowOk;
}

const floorMinute = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

/** Último minuto que coincide con el cron en (desde, hasta]. */
export function lastMatchBetween(expr: string, from: Date, to: Date): Date | null {
  const c = parseCron(expr);
  const start = floorMinute(from).getTime();
  for (let t = floorMinute(to).getTime(); t > start; t -= 60_000) {
    const d = new Date(t);
    if (cronMatches(c, d)) return d;
  }
  return null;
}

/** Próximas N ejecuciones (busca hasta 400 días). */
export function nextRuns(expr: string, from: Date, n = 3): Date[] {
  const c = parseCron(expr);
  const out: Date[] = [];
  let t = floorMinute(from).getTime() + 60_000;
  const limit = t + 400 * 86_400_000;
  // salto rápido por hora cuando la hora no coincide
  while (out.length < n && t < limit) {
    const d = new Date(t);
    const p = arParts(d);
    if (!c.hour.has(p.hour) || !c.month.has(p.month)) {
      t += (60 - p.minute) * 60_000;
      continue;
    }
    if (cronMatches(c, d)) out.push(d);
    t += 60_000;
  }
  return out;
}

// --- Presets legibles ---
export type SchedulePreset = "daily" | "weekdays" | "weekly" | "monthly" | "hourly";
export type ScheduleSpec = { preset: SchedulePreset; time?: string; weekday?: number; monthDay?: number };

export const SCHEDULE_PRESETS: { key: SchedulePreset; label: string }[] = [
  { key: "daily", label: "Todos los días" },
  { key: "weekdays", label: "De lunes a viernes" },
  { key: "weekly", label: "Una vez por semana" },
  { key: "monthly", label: "Una vez por mes" },
  { key: "hourly", label: "Cada hora" },
];
export const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function parseTime(time = "09:00"): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) throw new Error("Hora inválida");
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) throw new Error("Hora inválida");
  return [h, mi];
}

/** Preset → cron (hora Argentina). */
export function presetToCron(s: ScheduleSpec): string {
  const [h, mi] = parseTime(s.time);
  switch (s.preset) {
    case "daily":
      return `${mi} ${h} * * *`;
    case "weekdays":
      return `${mi} ${h} * * 1-5`;
    case "weekly": {
      const wd = s.weekday ?? 1;
      if (!Number.isInteger(wd) || wd < 0 || wd > 6) throw new Error("Día de la semana inválido");
      return `${mi} ${h} * * ${wd}`;
    }
    case "monthly": {
      const d = s.monthDay ?? 1;
      if (!Number.isInteger(d) || d < 1 || d > 28) throw new Error("Elegí un día entre 1 y 28");
      return `${mi} ${h} ${d} * *`;
    }
    case "hourly":
      return `${mi} * * * *`;
    default:
      throw new Error("Programación inválida");
  }
}

/** Cron → preset, si corresponde a uno de los presets. */
export function cronToPreset(cron: string): ScheduleSpec | null {
  const m = /^(\d{1,2}) (\*|\d{1,2}) (\*|\d{1,2}) \* (\*|1-5|\d)$/.exec(cron.trim());
  if (!m) return null;
  const [, mi, h, dom, dow] = m as unknown as [string, string, string, string, string];
  const time = h === "*" ? `00:${mi.padStart(2, "0")}` : `${h.padStart(2, "0")}:${mi.padStart(2, "0")}`;
  if (h === "*") return dom === "*" && dow === "*" ? { preset: "hourly", time } : null;
  if (dom === "*" && dow === "*") return { preset: "daily", time };
  if (dom === "*" && dow === "1-5") return { preset: "weekdays", time };
  if (dom === "*" && /^\d$/.test(dow)) return { preset: "weekly", time, weekday: Number(dow) };
  if (dow === "*" && /^\d+$/.test(dom)) return { preset: "monthly", time, monthDay: Number(dom) };
  return null;
}

/** Cron en español: "Todos los lunes a las 9:00". */
export function describeCron(cron: string): string {
  const p = cronToPreset(cron);
  if (!p) return `Programación personalizada (${cron})`;
  const [h, mi] = parseTime(p.time);
  const hhmm = `${h}:${String(mi).padStart(2, "0")}`;
  switch (p.preset) {
    case "daily":
      return `Todos los días a las ${hhmm}`;
    case "weekdays":
      return `De lunes a viernes a las ${hhmm}`;
    case "weekly":
      return `Todos los ${WEEKDAYS[p.weekday ?? 1]}${(p.weekday ?? 1) === 6 || (p.weekday ?? 1) === 0 ? "s" : ""} a las ${hhmm}`;
    case "monthly":
      return `El día ${p.monthDay} de cada mes a las ${hhmm}`;
    case "hourly":
      return `Cada hora, en el minuto ${mi}`;
    default:
      return cron;
  }
}

/** Solo se admiten programaciones con minuto fijo (como mucho, una vez por hora). */
export function cronFrequencyOk(cron: string): boolean {
  const first = cron.trim().split(/\s+/)[0] ?? "";
  return /^\d{1,2}$/.test(first);
}

// --- Firma de webhooks: X-Agencyos-Signature: t=<ts>,v1=<hmac(t.body)> ---
export const SIGNATURE_HEADER = "x-agencyos-signature";
export const REPLAY_WINDOW_S = 300;

export function signWebhook(secret: string, body: string, ts: number = Math.floor(Date.now() / 1000)): string {
  return `t=${ts},v1=${hmac(secret, `${ts}.${body}`)}`;
}

export function parseSignature(header: string | null | undefined): { t: number; v1: string } | null {
  if (!header) return null;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1 ?? "";
  if (!Number.isInteger(t) || t <= 0 || !/^[0-9a-f]{64}$/i.test(v1)) return null;
  return { t, v1: v1.toLowerCase() };
}

export type SignatureCheck = { ok: true; t: number; v1: string } | { ok: false; reason: "missing" | "stale" | "invalid" };

/** Verifica firma (tiempo constante) y ventana anti-replay de 5 minutos. */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string | null | undefined,
  nowS: number = Math.floor(Date.now() / 1000),
): SignatureCheck {
  const sig = parseSignature(header);
  if (!sig) return { ok: false, reason: "missing" };
  if (Math.abs(nowS - sig.t) > REPLAY_WINDOW_S) return { ok: false, reason: "stale" };
  if (!safeEqualHex(hmac(secret, `${sig.t}.${body}`), sig.v1)) return { ok: false, reason: "invalid" };
  return { ok: true, t: sig.t, v1: sig.v1 };
}

// --- Ids deterministas (idempotencia de programaciones) ---
export function deterministicUuid(...parts: string[]): string {
  const h = createHash("sha256").update(parts.join("|")).digest("hex");
  // formato UUID versión 8 (personalizado), variante RFC 4122
  const variant = ((Number.parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Espera exponencial entre reintentos: 2, 4, 8, 16 minutos. */
export const MAX_ATTEMPTS = 5;
export const retryDelayMs = (attempt: number) => 2 ** Math.max(1, attempt) * 60_000;
