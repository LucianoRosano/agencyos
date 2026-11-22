import { cashClose } from "@agencyos/modules/shop/cash";
import { renderCashClosePdf } from "@agencyos/pdf/shop-doc";
import type { NextRequest } from "next/server";
import { pdfResponse } from "@/lib/pdf-response";
import { requireShopCtx } from "@/lib/session";
import { cashCloseDoc, printFormatFor } from "@/lib/shop-print";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cierre de caja en PDF (`?dia=AAAA-MM-DD`, `?formato=a4|ticket80|ticket58`). */
export async function GET(req: NextRequest) {
  const sc = await requireShopCtx();
  const c = await cashClose(sc, req.nextUrl.searchParams.get("dia") ?? undefined);
  const f = printFormatFor(req, sc);
  return pdfResponse(req, () => renderCashClosePdf(cashCloseDoc(sc, c), f === "a4" ? "a4" : f === "ticket58" ? 58 : 80), `cierre-de-caja-${c.day}.pdf`);
}
