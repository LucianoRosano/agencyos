import { openNotification } from "@agencyos/modules/notifications/service";
import { type NextRequest, NextResponse } from "next/server";
import { requireCtx } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Abrir un aviso (desde el centro o desde el push): lo marca leído y lleva a lo que avisa. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Una precarga (del navegador o del router) no es «abrir»: no marca leído.
  const h = req.headers;
  if (h.get("next-router-prefetch") || h.get("purpose") === "prefetch" || (h.get("sec-purpose") ?? "").includes("prefetch")) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  const ctx = await requireCtx();
  const url = await openNotification(ctx, (await params).id);
  const dest = url && url.startsWith("/") && !url.startsWith("//") ? url : "/notificaciones";
  return NextResponse.redirect(new URL(dest, req.nextUrl.origin), 303);
}
