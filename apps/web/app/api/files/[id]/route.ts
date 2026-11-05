import { INLINE_MIMES } from "@agencyos/modules/library/magic";
import { verifyFileUrl } from "@agencyos/modules/library/queries";
import { resolveDownload } from "@agencyos/modules/library/service";
import { getStorage } from "@agencyos/modules/shared/storage";
import type { NextRequest } from "next/server";
import { requireCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () =>
  new Response("No encontrado", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" } });

function disposition(kind: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Descarga / vista previa (docs/08 §5): exige sesión Y URL firmada vigente (5 min).
 * Inline solo para imágenes rasterizadas y PDF; todo lo demás (incluido SVG) como descarga, con nosniff y CSP sandbox.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { ok, opts } = verifyFileUrl(id, req.nextUrl.searchParams);
  if (!ok)
    return new Response("El enlace venció o no es válido. Volvé a abrir el archivo desde AGENCYOS.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  const target = await resolveDownload(ctx, id, { version: opts.v, thumb: opts.thumb });
  if (!target) return notFound();
  let data: Buffer;
  try {
    data = await getStorage().get(target.key);
  } catch {
    return notFound();
  }
  const inline = !opts.dl && (opts.thumb || INLINE_MIMES.has(target.mime));
  const base = target.file.name.replace(/\.[^.]+$/, "");
  const ext = target.file.name.split(".").pop() ?? "";
  const name = opts.thumb ? `${base}.webp` : target.version !== target.file.currentVersion ? `${base}-v${target.version}.${ext}` : target.file.name;
  const headers: Record<string, string> = {
    "Content-Type": target.mime,
    "Content-Length": String(data.length),
    "Content-Disposition": disposition(inline ? "inline" : "attachment", name),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=300",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  // El visor de PDF de Chromium no funciona con sandbox: el PDF va sin CSP propia (no ejecuta scripts de la app).
  if (target.mime !== "application/pdf") headers["Content-Security-Policy"] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox";
  return new Response(new Uint8Array(data), { headers });
}
