import { diffDays, todayAR } from "@agencyos/core";

/** Paleta sugerida para materias (igual a la del servicio; siempre junto al nombre). */
export const COURSE_COLORS = ["#B7791F", "#7A4E7E", "#A9471F", "#4F7A52", "#B4637A", "#8C6A4F", "#C2703D", "#9C6B5A"] as const;

export type Slot = { day: number; from: string; to: string; room?: string };

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** Lunes primero. */
export const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: DAYS[d] ?? "" }));
export const dayName = (d: number) => DAYS[d] ?? "—";

/** Días que faltan hasta `date` (0 = hoy, negativo = pasó). */
export const daysUntil = (date: string, today = todayAR()) => diffDays(date, today);

/** "hoy", "mañana", "en 6 días", "hace 2 días". */
export function countdownLabel(date: string, today = todayAR()): string {
  const n = daysUntil(date, today);
  if (n === 0) return "hoy";
  if (n === 1) return "mañana";
  if (n > 1) return `en ${n} días`;
  return n === -1 ? "ayer" : `hace ${-n} días`;
}

/** Nota "7.50" → "7,5". */
export const formatGrade = (g: string | null | undefined) =>
  g === null || g === undefined ? "—" : Number(g).toLocaleString("es-AR", { maximumFractionDigits: 2 });
