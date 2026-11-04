/**
 * Dinero con precisión decimal exacta: se trabaja en centavos con BigInt.
 * Nunca se usa float para montos (docs/13 §8).
 */
export type Currency = "ARS" | "USD" | (string & {});

export function toCents(value: string | number): bigint {
  const s = typeof value === "number" ? value.toFixed(2) : String(value).trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Monto inválido: ${value}`);
  const neg = s.startsWith("-");
  const [int = "0", dec = ""] = s.replace("-", "").split(".");
  // redondeo half-up al centavo
  const d3 = `${dec}000`.slice(0, 3);
  let cents = BigInt(int) * 100n + BigInt(d3.slice(0, 2));
  if (Number(d3[2]) >= 5) cents += 1n;
  return neg ? -cents : cents;
}

export function fromCents(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const int = abs / 100n;
  const dec = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${int}.${dec}`;
}

export const addMoney = (...vals: (string | number)[]) => fromCents(vals.reduce<bigint>((a, v) => a + toCents(v), 0n));
export const subMoney = (a: string | number, b: string | number) => fromCents(toCents(a) - toCents(b));
export const cmpMoney = (a: string | number, b: string | number) => {
  const d = toCents(a) - toCents(b);
  return d === 0n ? 0 : d > 0n ? 1 : -1;
};

/** Multiplica un monto por una cantidad decimal (p. ej. 1.5 horas), redondeando al centavo. */
export function mulMoney(amount: string | number, qty: string | number): string {
  const a = toCents(amount); // centavos
  const q = toCents(qty); // cantidad × 100
  const raw = a * q; // centavos × 100
  const rounded = raw >= 0n ? (raw + 50n) / 100n : (raw - 50n) / 100n;
  return fromCents(rounded);
}

/** Porcentaje de un monto (pct puede tener decimales: "12.5"). */
export function percentOf(amount: string | number, pct: string | number): string {
  const a = toCents(amount);
  const p = toCents(pct); // pct × 100
  const raw = a * p; // centavos × 100 × 100... => dividir por 10000
  const rounded = raw >= 0n ? (raw + 5000n) / 10000n : (raw - 5000n) / 10000n;
  return fromCents(rounded);
}

/** Reparte un total en partes por porcentaje; la última absorbe el redondeo. */
export function splitByPercents(total: string, percents: number[]): string[] {
  const parts: string[] = [];
  let acc = 0n;
  percents.forEach((p, i) => {
    if (i === percents.length - 1) parts.push(fromCents(toCents(total) - acc));
    else {
      const v = toCents(percentOf(total, p));
      acc += v;
      parts.push(fromCents(v));
    }
  });
  return parts;
}

const fmtCache = new Map<string, Intl.NumberFormat>();
/** Formato es-AR: "$ 1.234,56" / "US$ 1.234,56". */
export function formatMoney(amount: string | number | null | undefined, currency: Currency = "ARS", opts: { decimals?: boolean } = {}): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = Number(amount);
  const decimals = opts.decimals ?? !Number.isInteger(n);
  const key = `${decimals}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("es-AR", { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0 });
    fmtCache.set(key, f);
  }
  const prefix = currency === "ARS" ? "$" : currency === "USD" ? "US$" : currency;
  const s = f.format(Math.abs(n));
  return `${n < 0 ? "-" : ""}${prefix} ${s}`;
}
