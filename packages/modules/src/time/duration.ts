import { fromCents, toCents } from "@agencyos/core";

/**
 * Duración escrita a mano → minutos. Acepta:
 * "90" (minutos), "45m", "2h", "1h30", "1h 30m", "1:30", "1,5h", "1.5h", "1,5" (decimal sin unidad = horas).
 * Devuelve null si no se entiende.
 */
export function parseDuration(input: unknown): number | null {
  if (typeof input === "number") return Number.isInteger(input) && input > 0 ? input : null;
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const plain = s.match(/^(\d{1,4})(?:m|min|mins|minutos?)?$/);
  if (plain) return Number(plain[1]);
  const clock = s.match(/^(\d{1,3}):([0-5]\d)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const hm = s.match(/^(\d{1,3})(?:h|hs|hora|horas)(?:(\d{1,2})(?:m|min|mins|minutos?)?)?$/);
  if (hm) {
    const extra = hm[2] ? Number(hm[2]) : 0;
    return extra >= 60 ? null : Number(hm[1]) * 60 + extra;
  }
  const dec = s.match(/^(\d{1,3})[.,](\d{1,2})(?:h|hs|horas?)?$/);
  if (dec) return Math.round((Number(dec[1]) + Number(`0.${dec[2]}`)) * 60);
  return null;
}

/** 90 → "1 h 30 min"; 45 → "45 min"; 120 → "2 h". */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Horas con un decimal para totales: 90 → "1,5". Solo presentación (no es dinero). */
export function hoursLabel(total: number): string {
  const tenths = Math.round(total / 6); // décimas de hora
  const int = Math.floor(tenths / 10);
  const dec = tenths % 10;
  return dec ? `${int},${dec}` : String(int);
}

/**
 * Tarifa efectiva por hora = monto / horas, en centavos con BigInt (sin float).
 * monto en string decimal ("150000.00"), minutos enteros. Redondeo half-up al centavo.
 */
export function effectiveHourlyRate(amount: string, minutes: number): string | null {
  if (!minutes || minutes <= 0) return null;
  const cents = toCents(amount) * 60n;
  const den = BigInt(minutes);
  const q = cents / den;
  const r = cents % den;
  const rounded = r * 2n >= den ? q + 1n : q;
  return fromCents(rounded);
}
