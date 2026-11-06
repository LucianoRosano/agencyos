import { buildReportDoc } from "@agencyos/modules/seo/queries";
import { renderSeoReportPdf } from "@agencyos/pdf/seo-report";
import type { NextRequest } from "next/server";
import { requireCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Informe PDF de la auditoría (marca de la agencia), generado con Chromium. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const doc = await buildReportDoc(ctx, (await params).id);
  if (!doc) return new Response("No encontrado o la auditoría no está completa", { status: 404 });
  try {
    const pdf = await renderSeoReportPdf(doc);
    const name = `auditoria-seo-${doc.host.replace(/[^a-z0-9.-]/gi, "_")}-${doc.auditedOn}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${req.nextUrl.searchParams.get("ver") === "1" ? "inline" : "attachment"}; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[pdf seo] no se pudo generar", e);
    return new Response("No se pudo generar el PDF. Probá de nuevo en unos segundos.", { status: 500 });
  }
}
