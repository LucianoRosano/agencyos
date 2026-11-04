import { addDays, addMonths, dayOfWeek } from "./dates";

/** Presets de recurrencia (subconjunto de RRULE) usados en tareas y suscripciones. */
export const RECURRENCE_PRESETS = [
  { value: "", label: "No se repite" },
  { value: "FREQ=DAILY", label: "Todos los días" },
  { value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", label: "Días hábiles (lun a vie)" },
  { value: "FREQ=WEEKLY", label: "Todas las semanas" },
  { value: "FREQ=WEEKLY;INTERVAL=2", label: "Cada 2 semanas" },
  { value: "FREQ=MONTHLY", label: "Todos los meses" },
  { value: "FREQ=YEARLY", label: "Todos los años" },
] as const;

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function parseRrule(rule: string): { freq: string; interval: number; byDay: number[] } {
  const parts = Object.fromEntries(
    rule
      .replace(/^RRULE:/, "")
      .split(";")
      .filter(Boolean)
      .map((p) => p.split("=") as [string, string]),
  );
  const freq = parts.FREQ;
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) throw new Error("Recurrencia no soportada");
  const interval = Math.max(1, Number(parts.INTERVAL ?? 1));
  const byDay = parts.BYDAY
    ? parts.BYDAY.split(",")
        .map((d) => DAY_CODES.indexOf(d))
        .filter((n) => n >= 0)
    : [];
  return { freq, interval, byDay };
}

/** Próxima fecha estrictamente posterior a `from` ("YYYY-MM-DD"). */
export function nextOccurrence(rule: string, from: string): string {
  const { freq, interval, byDay } = parseRrule(rule);
  switch (freq) {
    case "DAILY":
      return addDays(from, interval);
    case "WEEKLY": {
      if (byDay.length === 0) return addDays(from, 7 * interval);
      for (let i = 1; i <= 7 * interval + 7; i++) {
        const d = addDays(from, i);
        if (byDay.includes(dayOfWeek(d))) return d;
      }
      return addDays(from, 7);
    }
    case "MONTHLY":
      return addMonths(from, interval);
    case "YEARLY":
      return addMonths(from, 12 * interval);
    default:
      throw new Error("Recurrencia no soportada");
  }
}

export function recurrenceLabel(rule: string | null | undefined): string | null {
  if (!rule) return null;
  return RECURRENCE_PRESETS.find((p) => p.value === rule)?.label ?? "Personalizada";
}
