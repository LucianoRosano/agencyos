import { shopDocument } from "@agencyos/modules/shop/documents";
import { renderShopDocPdf } from "@agencyos/pdf/shop-doc";
import type { NextRequest } from "next/server";
import { pdfResponse } from "@/lib/pdf-response";
import { requireShopCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Remito del pedido en PDF: con `?precios=1` sale valorizado (con precios y total). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sc = await requireShopCtx();
  const valued = req.nextUrl.searchParams.get("precios") === "1";
  const doc = await shopDocument(sc, valued ? "remito-valorizado" : "remito", (await params).id);
  if (!doc) return new Response("No encontrado", { status: 404 });
  return pdfResponse(req, () => renderShopDocPdf(doc), `remito-${doc.number}.pdf`);
}
