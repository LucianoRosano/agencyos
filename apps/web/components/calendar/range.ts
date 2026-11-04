import { addDays, addMonths, dayOfWeek, endOfMonth, monthName, startOfMonth, todayAR } from "@agencyos/core";

/** Utilidades puras del calendario (sin imports de servidor). Semana de lunes a domingo, zona AR. */

export const VIEWS = [
  { key: "mes", label: "Mes" },
  { key: "semana", label: "Semana" },
  { key: "dia", label: "Día" },
  { key: "agenda", label: "Agenda" },
] as const;
export type View = (typeof VIEWS)[number]["key"];
export const AGENDA_DAYS = 30;

export const isView = (v: string | undefined): v is View => VIEWS.some((x) => x.key === v);
export const isISODate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Lunes de la semana de `iso`. */
export const startOfWeek = (iso: string) => addDays(iso, -((dayOfWeek(iso) + 6) % 7));

export function rangeFor(view: View, date: string): { from: string; to: string } {
  switch (view) {
    case "mes": {
      // la grilla del mes arranca el lunes anterior al 1 y termina el domingo posterior al último día
      return { from: startOfWeek(startOfMonth(date)), to: addDays(startOfWeek(endOfMonth(date)), 6) };
    }
    case "semana":
      return { from: startOfWeek(date), to: addDays(startOfWeek(date), 6) };
    case "dia":
      return { from: date, to: date };
    case "agenda":
      return { from: date, to: addDays(date, AGENDA_DAYS - 1) };
  }
}

export function shift(view: View, date: string, dir: 1 | -1): string {
  switch (view) {
    case "mes":
      return startOfMonth(addMonths(startOfMonth(date), dir));
    case "semana":
      return addDays(date, 7 * dir);
    case "dia":
      return addDays(date, dir);
    case "agenda":
      return addDays(date, AGENDA_DAYS * dir);
  }
}

export function days(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const mShort = (iso: string) => monthName(Number(iso.slice(5, 7))).slice(0, 3);

export function rangeTitle(view: View, date: string): string {
  const y = date.slice(0, 4);
  if (view === "mes") return `${cap(monthName(Number(date.slice(5, 7))))} ${y}`;
  if (view === "dia") {
    const d = Number(date.slice(8, 10));
    return `${d} de ${monthName(Number(date.slice(5, 7)))} ${y}`;
  }
  const { from, to } = rangeFor(view, date);
  const f = `${Number(from.slice(8, 10))}${from.slice(5, 7) === to.slice(5, 7) ? "" : ` ${mShort(from)}`}`;
  return `${f} – ${Number(to.slice(8, 10))} ${mShort(to)} ${to.slice(0, 4)}`;
}

export type CalParams = { vista: View; fecha: string; ocultar: string[] };

export function calHref(p: CalParams, patch: Partial<CalParams> = {}): string {
  const next = { ...p, ...patch };
  const q = new URLSearchParams();
  q.set("vista", next.vista);
  if (next.fecha !== todayAR()) q.set("fecha", next.fecha);
  if (next.ocultar.length) q.set("ocultar", [...next.ocultar].sort().join(","));
  return `/calendario?${q.toString()}`;
}
