import "server-only";
import { formatDate, formatDateTime } from "@agencyos/core";
import type { CashClose } from "@agencyos/modules/shop/cash";
import { PRINT_FORMATS, type PrintFormat, type ShopCtx } from "@agencyos/modules/shop/service";
import { type CashCloseDoc, renderShopDocPdf, renderShopTicketPdf, type ShopDoc } from "@agencyos/pdf/shop-doc";
import type { NextRequest } from "next/server";
import { pdfResponse } from "@/lib/pdf-response";

/** Formato de impresión: `?formato=` si viene, si no el elegido en los ajustes del comercio (A4 por defecto). */
export function printFormatFor(req: NextRequest, sc: Pick<ShopCtx, "settings">): PrintFormat {
  const q = req.nextUrl.searchParams.get("formato");
  if (q && (PRINT_FORMATS as readonly string[]).includes(q)) return q as PrintFormat;
  return sc.settings.printFormat ?? "a4";
}

/** Comprobante o remito en PDF: hoja A4 con membrete o ticket térmico de 80 / 58 mm. */
export function shopDocResponse(req: NextRequest, sc: Pick<ShopCtx, "settings">, doc: ShopDoc, name: string) {
  const f = printFormatFor(req, sc);
  return pdfResponse(
    req,
    () => (f === "a4" ? renderShopDocPdf(doc) : renderShopTicketPdf(doc, f === "ticket58" ? 58 : 80)),
    `${name}${f === "a4" ? "" : "-ticket"}.pdf`,
  );
}

/** Datos del cierre de caja para imprimir. */
export function cashCloseDoc(sc: Pick<ShopCtx, "shopName" | "currency">, c: CashClose): CashCloseDoc {
  return {
    shopName: sc.shopName,
    currency: sc.currency,
    dayLabel: formatDate(c.day),
    printedAt: formatDateTime(new Date()),
    count: c.count,
    total: c.total,
    discount: c.discount,
    cash: c.cash,
    nonCash: c.nonCash,
    onAccount: c.onAccount,
    collections: c.collections,
    collected: c.collected,
    cancelled: c.cancelled,
    units: c.units,
    payments: c.payments,
    items: c.items,
    sellers: c.sellers,
  };
}
