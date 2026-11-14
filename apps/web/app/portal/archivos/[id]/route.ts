import { INLINE_MIMES } from "@agencyos/modules/library/magic";
import { resolveSharedFile } from "@agencyos/modules/portal/service";
import { getStorage } from "@agencyos/modules/shared/storage";
import type { NextRequest } from "next/server";
import { requirePortalCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (msg: string, status: number) =>
  new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" } });

/** Descarga de un recurso compartido: exige sesión de cliente, URL firmada vigente (5 min) y que el archivo esté compartido con su cliente. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const pc = await requirePortalCtx();
  const { id } = await params;
  const r = await resolveSharedFile(pc, id, req.nextUrl.searchParams);
  if (!r.ok) return r.reason === "expired" ? text("El enlace venció. Volvé a abrir el archivo desde el portal.", 403) : text("No encontrado", 404);
  let data: Buffer;
  try {
    data = await getStorage().get(r.file.storageKey);
  } catch {
    return text("No encontrado", 404);
  }
  const inline = INLINE_MIMES.has(r.file.mime);
  const ascii = r.file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const headers: Record<string, string> = {
    "Content-Type": r.file.mime,
    "Content-Length": String(data.length),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(r.file.name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=300",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (r.file.mime !== "application/pdf") headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";
  return new Response(new Uint8Array(data), { headers });
}
