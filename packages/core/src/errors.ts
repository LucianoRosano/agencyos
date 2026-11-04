export type DomainErrorCode = "NOT_FOUND" | "FORBIDDEN" | "VALIDATION" | "CONFLICT" | "EXTERNAL" | "UNAUTHENTICATED";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what = "El elemento") => new DomainError("NOT_FOUND", `${what} no existe o fue eliminado.`);
export const forbidden = (msg = "No tenés permiso para esta acción.") => new DomainError("FORBIDDEN", msg);
export const validation = (msg: string, fields?: Record<string, string>) => new DomainError("VALIDATION", msg, fields);
export const conflict = (msg: string) => new DomainError("CONFLICT", msg);

export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: DomainErrorCode; message: string; fields?: Record<string, string> } };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

/** Convierte cualquier excepción en un Result tipado sin filtrar stack traces. */
export function toResultError(e: unknown): Result<never> {
  if (e instanceof DomainError) return { ok: false, error: { code: e.code, message: e.message, fields: e.fields } };
  if (e && typeof e === "object" && "issues" in e && Array.isArray((e as { issues: unknown[] }).issues)) {
    const fields: Record<string, string> = {};
    for (const issue of (e as { issues: { path: (string | number)[]; message: string }[] }).issues) {
      const key = issue.path.join(".") || "_";
      if (!fields[key]) fields[key] = issue.message;
    }
    return { ok: false, error: { code: "VALIDATION", message: "Revisá los campos marcados.", fields } };
  }
  console.error("[error inesperado]", e);
  return { ok: false, error: { code: "EXTERNAL", message: "Ocurrió un error inesperado. Probá de nuevo." } };
}
