import { formatDate, formatDateTime } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { and, eq } from "drizzle-orm";
import { CHANNEL_LABEL, ORDER_LABEL, PAYMENT_LABEL, type ShopCtx } from "./service";

/**
 * Datos de los documentos imprimibles del comercio: comprobante de venta y remito de pedido
 * (con o sin precios). Estructura de `ShopDoc` de @agencyos/pdf/shop-doc. Siempre dentro del comercio activo.
 */
export type ShopDocKind = "sale" | "remito" | "remito-valorizado";

export async function shopDocument(sc: ShopCtx, kind: ShopDocKind, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = getDb();
  const [shop] = await db.select().from(schema.shop).where(eq(schema.shop.id, sc.shopId));
  if (!shop) return null;
  const settings = (shop.settings ?? {}) as ShopCtx["settings"];
  const base = {
    shop: {
      name: shop.name,
      address: settings.address || null,
      phone: settings.phone || null,
      taxId: settings.taxId || null,
      footer: settings.ticketFooter || null,
    },
    currency: shop.currency,
  };
  const customerOf = async (customerId: string | null) => {
    if (!customerId) return null;
    const [c] = await db
      .select()
      .from(schema.shopCustomer)
      .where(and(eq(schema.shopCustomer.id, customerId), eq(schema.shopCustomer.shopId, sc.shopId)));
    return c ? { name: c.name, doc: c.doc, phone: c.phone, email: c.email } : null;
  };

  if (kind === "sale") {
    const [s] = await db
      .select()
      .from(schema.shopSale)
      .where(and(eq(schema.shopSale.id, id), eq(schema.shopSale.shopId, sc.shopId)));
    if (!s) return null;
    const items = await db.select().from(schema.shopSaleItem).where(eq(schema.shopSaleItem.saleId, id));
    return {
      ...base,
      kind: "sale" as const,
      number: s.number,
      issuedAt: formatDateTime(s.soldAt),
      customer: await customerOf(s.customerId),
      items: items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
      subtotal: s.subtotal,
      discount: s.discount,
      total: s.total,
      showPrices: true,
      paymentLabel: PAYMENT_LABEL[s.paymentMethod as keyof typeof PAYMENT_LABEL] ?? s.paymentMethod,
      cancelled: s.status === "cancelled",
      delivery: null,
      sellerName: sc.actorName,
    };
  }

  const [o] = await db
    .select()
    .from(schema.shopOrder)
    .where(and(eq(schema.shopOrder.id, id), eq(schema.shopOrder.shopId, sc.shopId)));
  if (!o) return null;
  const items = await db.select().from(schema.shopOrderItem).where(eq(schema.shopOrderItem.orderId, id));
  return {
    ...base,
    kind: "remito" as const,
    number: o.number,
    issuedAt: formatDateTime(o.createdAt),
    customer: await customerOf(o.customerId),
    items: items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    subtotal: o.total,
    discount: "0",
    total: o.total,
    showPrices: kind === "remito-valorizado",
    paymentLabel: null,
    cancelled: o.status === "cancelled",
    delivery: {
      date: o.deliveryDate ? formatDate(o.deliveryDate) : null,
      channel: CHANNEL_LABEL[o.channel as keyof typeof CHANNEL_LABEL] ?? o.channel,
      status: ORDER_LABEL[o.status as keyof typeof ORDER_LABEL] ?? o.status,
      notes: o.notes,
    },
    sellerName: sc.actorName,
  };
}
