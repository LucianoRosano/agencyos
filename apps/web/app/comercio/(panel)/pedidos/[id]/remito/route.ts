import { shopDocument } from "@agencyos/modules/shop/documents";
import type { NextRequest } from "next/server";
import { requireShopCtx } from "@/lib/session";
import { shopDocResponse } from "@/lib/shop-print";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Remito del pedido en PDF (A4 o ticket, `?formato=`): con `?precios=1` sale valorizado (con precios y total). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sc = await requireShopCtx();
  const valued = req.nextUrl.searchParams.get("precios") === "1";
  const doc = await shopDocument(sc, valued ? "remito-valorizado" : "remito", (await params).id);
  if (!doc) return new Response("No encontrado", { status: 404 });
  return shopDocResponse(req, sc, doc, `remito-${doc.number}`);
}
