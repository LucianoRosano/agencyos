import { shopDocument } from "@agencyos/modules/shop/documents";
import { renderShopDocPdf } from "@agencyos/pdf/shop-doc";
import type { NextRequest } from "next/server";
import { pdfResponse } from "@/lib/pdf-response";
import { requireShopCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Comprobante de venta en PDF (no válido como factura), con los datos del comercio. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sc = await requireShopCtx();
  const doc = await shopDocument(sc, "sale", (await params).id);
  if (!doc) return new Response("No encontrado", { status: 404 });
  return pdfResponse(req, () => renderShopDocPdf(doc), `comprobante-${doc.number}.pdf`);
}
