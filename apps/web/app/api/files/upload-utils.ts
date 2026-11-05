import "server-only";
import { DomainError, toResultError, validation } from "@agencyos/core";
import { MAX_FILE_BYTES } from "@agencyos/modules/library/magic";
import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";

/** Las Server Actions comparan el origen; los route handlers que escriben lo hacen acá (CSRF). */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Lee el cuerpo en streaming cortando apenas se pasa del máximo (no se carga un archivo gigante en memoria). */
export async function readBody(req: NextRequest, max = MAX_FILE_BYTES): Promise<Buffer> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) throw validation("El archivo supera los 100 MB.", { file: "Máximo 100 MB" });
  if (!req.body) throw validation("El archivo está vacío.", { file: "Vacío" });
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw validation("El archivo supera los 100 MB.", { file: "Máximo 100 MB" });
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function fileNameFrom(req: NextRequest) {
  const raw = req.headers.get("x-file-name") ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const STATUS: Record<string, number> = { VALIDATION: 400, NOT_FOUND: 404, FORBIDDEN: 403, CONFLICT: 409, UNAUTHENTICATED: 401 };

export async function jsonResult<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    const r = toResultError(e);
    if (r.ok) throw e;
    let status = STATUS[r.error.code] ?? 500;
    if (e instanceof DomainError && /100 MB|espacio disponible/.test(e.message)) status = 413;
    return Response.json(r, { status });
  }
}

export const forbiddenOrigin = () => Response.json({ ok: false, error: { code: "FORBIDDEN", message: "Origen no permitido." } }, { status: 403 });
