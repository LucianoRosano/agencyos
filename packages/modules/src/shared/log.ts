/**
 * Logs estructurados JSON (una línea por evento, a stdout) con redacción de campos sensibles (docs/08 §4) — los usan
 * la web y el worker (docs/OBSERVABILITY.md). Campos estándar: level, time, msg, service, requestId (si hay).
 * Solo servidor.
 */
const SENSITIVE = /password|token|secret|authorization|cookie|cuit|email/i;

export type LogData = Record<string, unknown>;

function redact(obj: LogData): LogData {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redactado]" : v instanceof Error ? v.message : v]));
}

const service = () => process.env.OTEL_SERVICE_NAME || `agencyos-${process.env.AGENCYOS_ROLE ?? "web"}`;

function write(level: "debug" | "info" | "warn" | "error", data: LogData, msg: string) {
  if (level === "debug" && process.env.LOG_LEVEL !== "debug") return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, service: service(), ...redact(data) });
  (level === "error" ? process.stderr : process.stdout).write(`${line}\n`);
}

export const log = {
  debug: (data: LogData, msg: string) => write("debug", data, msg),
  info: (data: LogData, msg: string) => write("info", data, msg),
  warn: (data: LogData, msg: string) => write("warn", data, msg),
  error: (data: LogData, msg: string) => write("error", data, msg),
};

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** `x-request-id` entrante si es válido (lo pone Caddy o proxy.ts); si no, uno nuevo. */
export function requestIdFrom(h: Headers | null | undefined): string {
  const v = h?.get("x-request-id");
  return v && REQUEST_ID.test(v) ? v : crypto.randomUUID();
}
