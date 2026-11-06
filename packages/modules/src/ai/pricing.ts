/**
 * Tabla de precios por modelo (USD por millón de tokens, API directa de Anthropic).
 * Fuente: lista pública de precios de Anthropic, vigente al 06/11/2026. Actualizar acá si cambian.
 * - Escritura en caché: 1,25× el precio de entrada (TTL 5 min). Lectura de caché: 0,1× el de entrada.
 * - Un modelo desconocido se cotiza con el precio más caro de la tabla (estimación conservadora).
 *
 * Los costos se calculan en enteros (nano-USD, BigInt) y se guardan como string con 6 decimales
 * (`agent_run.cost_usd numeric(10,6)`). Nunca float.
 */
export const DEFAULT_MODEL = "claude-sonnet-5-5";

export const MODEL_PRICES: Record<string, { label: string; inputPerM: string; outputPerM: string }> = {
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5 (recomendado)", inputPerM: "2.00", outputPerM: "10.00" },
  "claude-haiku-5-5": { label: "Claude Haiku 5.5 (rápido y barato)", inputPerM: "0.10", outputPerM: "0.50" },
  "claude-opus-5-5": { label: "Claude Opus 5.5 (gama alta)", inputPerM: "4.00", outputPerM: "20.00" },
  "claude-fable-5-1": { label: "Claude Fable 5.1 (máxima capacidad)", inputPerM: "10.00", outputPerM: "50.00" },
};

export const MODEL_IDS = Object.keys(MODEL_PRICES);

/** "2.00" USD/M → nano-USD por token (2.00 $/M = 2000 n$/token). */
function nanoPerToken(perM: string): bigint {
  const [i = "0", d = ""] = perM.split(".");
  const micro = BigInt(i) * 1_000_000n + BigInt(`${d}000000`.slice(0, 6));
  // (µ$ por millón de tokens) × 1000 n$/µ$ ÷ 1e6 tokens = µ$/1000 n$ por token
  return micro / 1000n;
}

function priceFor(model: string) {
  const p = MODEL_PRICES[model] ?? MODEL_PRICES["claude-fable-5-1"];
  if (!p) throw new Error("Tabla de precios vacía");
  return { input: nanoPerToken(p.inputPerM), output: nanoPerToken(p.outputPerM) };
}

export type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** Costo de una llamada en micro-USD (redondeado hacia arriba). */
export function costMicroUsd(model: string, u: UsageLike): bigint {
  const p = priceFor(model);
  const nano =
    BigInt(u.input_tokens) * p.input +
    BigInt(u.output_tokens) * p.output +
    (BigInt(u.cache_creation_input_tokens ?? 0) * p.input * 125n) / 100n +
    (BigInt(u.cache_read_input_tokens ?? 0) * p.input) / 10n;
  return (nano + 999n) / 1000n;
}

/** "1.234567" (USD) → micro-USD. Acepta hasta 6 decimales. */
export function usdToMicro(v: string | number | null | undefined): bigint {
  const s = String(v ?? "0").trim() || "0";
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`Monto inválido: ${s}`);
  const neg = s.startsWith("-");
  const [i = "0", d = ""] = s.replace("-", "").split(".");
  const m = BigInt(i) * 1_000_000n + BigInt(`${d}000000`.slice(0, 6));
  return neg ? -m : m;
}

/** micro-USD → "1.234567". */
export function microToUsd(m: bigint): string {
  const neg = m < 0n;
  const a = neg ? -m : m;
  return `${neg ? "-" : ""}${a / 1_000_000n}.${String(a % 1_000_000n).padStart(6, "0")}`;
}

/** Formato para la UI: "US$ 0,0123" (4 decimales si es menor a 1, 2 si no). */
export function formatUsd(v: string | bigint): string {
  const m = typeof v === "bigint" ? v : usdToMicro(v);
  const s = microToUsd(m);
  const [i = "0", d = "000000"] = s.split(".");
  const dec = m !== 0n && m < 1_000_000n ? d.slice(0, 4) : d.slice(0, 2);
  return `US$ ${Number(i).toLocaleString("es-AR")},${dec}`;
}
