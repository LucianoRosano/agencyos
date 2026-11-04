/** Logs estructurados JSON con redacción de campos sensibles (docs/08 §4). */
const SENSITIVE = /password|token|secret|authorization|cuit|email/i;

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redactado]" : v]));
}

function write(level: string, data: Record<string, unknown>, msg: string) {
  process.stdout.write(`${JSON.stringify({ level, time: new Date().toISOString(), msg, ...redact(data) })}\n`);
}

export const log = {
  info: (data: Record<string, unknown>, msg: string) => write("info", data, msg),
  warn: (data: Record<string, unknown>, msg: string) => write("warn", data, msg),
  error: (data: Record<string, unknown>, msg: string) => write("error", data, msg),
};
