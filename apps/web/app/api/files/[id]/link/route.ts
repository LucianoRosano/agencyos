import { signedFileUrl } from "@agencyos/modules/library/queries";
import { resolveDownload } from "@agencyos/modules/library/service";
import type { NextRequest } from "next/server";
import { requireCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Enlace estable para botones de descarga: con sesión, redirige a una URL firmada recién emitida (5 min). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const v = Number(sp.get("v")) || undefined;
  const thumb = sp.get("thumb") === "1";
  const target = await resolveDownload(ctx, id, { version: v, thumb });
  if (!target) return new Response("No encontrado", { status: 404 });
  const url = signedFileUrl(id, { v: target.version, thumb, dl: sp.get("dl") === "1" });
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}
