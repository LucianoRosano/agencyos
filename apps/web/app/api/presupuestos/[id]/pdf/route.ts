import { assertCan } from "@agencyos/core";
import { getQuoteDocument } from "@agencyos/modules/quotes/queries";
import { renderQuotePdf } from "@agencyos/pdf";
import type { NextRequest } from "next/server";
import { requireCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Descarga del PDF del presupuesto (versión actual o `?version=<id>`), generado con Chromium. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  assertCan(ctx, "read", "quote");
  const { id } = await params;
  const versionId = req.nextUrl.searchParams.get("version");
  if (!UUID.test(id) || (versionId && !UUID.test(versionId))) return new Response("No encontrado", { status: 404 });
  const doc = await getQuoteDocument(ctx, id, versionId);
  if (!doc) return new Response("No encontrado", { status: 404 });
  try {
    const pdf = await renderQuotePdf(doc);
    const name = `${doc.number}${versionId ? `-v${doc.version}` : ""}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${req.nextUrl.searchParams.get("ver") === "1" ? "inline" : "attachment"}; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[pdf] no se pudo generar", e);
    return new Response("No se pudo generar el PDF. Probá de nuevo en unos segundos.", { status: 500 });
  }
}
