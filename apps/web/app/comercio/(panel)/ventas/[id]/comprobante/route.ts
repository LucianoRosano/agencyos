import { shopDocument } from "@agencyos/modules/shop/documents";
import type { NextRequest } from "next/server";
import { requireShopCtx } from "@/lib/session";
import { shopDocResponse } from "@/lib/shop-print";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Comprobante de venta en PDF (no válido como factura): hoja A4 o ticket térmico (`?formato=`). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sc = await requireShopCtx();
  const doc = await shopDocument(sc, "sale", (await params).id);
  if (!doc) return new Response("No encontrado", { status: 404 });
  return shopDocResponse(req, sc, doc, `comprobante-${doc.number}`);
}
