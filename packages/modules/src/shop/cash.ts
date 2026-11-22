import { addDays, addMoney, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { COLLECT_METHODS, PAYMENT_LABEL, PAYMENT_METHODS, type ShopCtx } from "./service";

/**
 * Cierre de caja del día: lo cobrado por medio de pago, las anuladas, lo vendido y quién vendió.
 * Solo lectura (no guarda nada): se calcula de las ventas del día del comercio activo.
 */
export type CashClose = Awaited<ReturnType<typeof cashClose>>;

export async function cashClose(sc: ShopCtx, rawDay?: string) {
  const today = todayAR();
  const day = rawDay && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) && rawDay <= today ? rawDay : today;
  const db = getDb();
  const sid = sc.shopId;
  const onDay = and(eq(schema.shopSale.shopId, sid), sql`${schema.shopSale.day} = ${day}::date`);
  const [byPayment, [totals], items, sellers, collectedBy] = await Promise.all([
    db
      .select({
        method: schema.shopSale.paymentMethod,
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${schema.shopSale.total}), 0)::text`,
      })
      .from(schema.shopSale)
      .where(and(onDay, eq(schema.shopSale.status, "completed")))
      .groupBy(schema.shopSale.paymentMethod),
    db
      .select({
        count: sql<number>`count(*) filter (where ${schema.shopSale.status} = 'completed')::int`,
        total: sql<string>`coalesce(sum(${schema.shopSale.total}) filter (where ${schema.shopSale.status} = 'completed'), 0)::text`,
        discount: sql<string>`coalesce(sum(${schema.shopSale.discount}) filter (where ${schema.shopSale.status} = 'completed'), 0)::text`,
        cancelledCount: sql<number>`count(*) filter (where ${schema.shopSale.status} = 'cancelled')::int`,
        cancelledTotal: sql<string>`coalesce(sum(${schema.shopSale.total}) filter (where ${schema.shopSale.status} = 'cancelled'), 0)::text`,
        first: sql<Date | null>`min(${schema.shopSale.soldAt})`,
        last: sql<Date | null>`max(${schema.shopSale.soldAt})`,
      })
      .from(schema.shopSale)
      .where(onDay),
    db
      .select({
        name: schema.shopSaleItem.name,
        qty: sql<number>`sum(${schema.shopSaleItem.qty})::int`,
        total: sql<string>`sum(${schema.shopSaleItem.lineTotal})::text`,
      })
      .from(schema.shopSaleItem)
      .innerJoin(schema.shopSale, eq(schema.shopSale.id, schema.shopSaleItem.saleId))
      .where(and(onDay, eq(schema.shopSale.status, "completed")))
      .groupBy(schema.shopSaleItem.productId, schema.shopSaleItem.name)
      .orderBy(desc(sql`sum(${schema.shopSaleItem.lineTotal})`))
      .limit(50),
    db
      .select({
        name: sql<string>`coalesce(${schema.user.name}, 'Sin usuario')`,
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${schema.shopSale.total}), 0)::text`,
      })
      .from(schema.shopSale)
      .leftJoin(schema.user, eq(schema.user.id, schema.shopSale.createdBy))
      .where(and(onDay, eq(schema.shopSale.status, "completed")))
      .groupBy(schema.user.name)
      .orderBy(desc(sql`sum(${schema.shopSale.total})`)),
    db
      .select({
        method: schema.shopCustomerPayment.method,
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${schema.shopCustomerPayment.amount}), 0)::text`,
      })
      .from(schema.shopCustomerPayment)
      .where(and(eq(schema.shopCustomerPayment.shopId, sid), sql`${schema.shopCustomerPayment.day} = ${day}::date`))
      .groupBy(schema.shopCustomerPayment.method),
  ]);
  const map = new Map(byPayment.map((p) => [p.method, p]));
  const cmap = new Map(collectedBy.map((p) => [p.method, p]));
  const collections = COLLECT_METHODS.filter((m) => cmap.has(m)).map((m) => ({
    method: m,
    label: PAYMENT_LABEL[m],
    count: cmap.get(m)?.count ?? 0,
    total: cmap.get(m)?.total ?? "0",
  }));
  const payments = PAYMENT_METHODS.filter((m) => map.has(m)).map((m) => ({
    method: m,
    label: m === "account" ? "Fiado (cuenta corriente)" : PAYMENT_LABEL[m],
    count: map.get(m)?.count ?? 0,
    total: map.get(m)?.total ?? "0",
  }));
  const cashSales = map.get("cash")?.total ?? "0";
  const cashCollected = cmap.get("cash")?.total ?? "0";
  return {
    day,
    isToday: day === today,
    prevDay: addDays(day, -1),
    nextDay: day < today ? addDays(day, 1) : null,
    hasActivity: (totals?.count ?? 0) + (totals?.cancelledCount ?? 0) + collections.length > 0,
    count: totals?.count ?? 0,
    total: totals?.total ?? "0",
    discount: totals?.discount ?? "0",
    /** Efectivo a contar: ventas en efectivo + cobros de cuentas en efectivo. */
    cash: addMoney(cashSales, cashCollected),
    /** Otros medios: ventas y cobros con tarjeta, transferencia, Mercado Pago… (sin el fiado). */
    nonCash: addMoney(
      "0",
      ...payments.filter((p) => p.method !== "cash" && p.method !== "account").map((p) => p.total),
      ...collections.filter((p) => p.method !== "cash").map((p) => p.total),
    ),
    /** Vendido a cuenta (fiado) en el día: no entra a la caja hasta que lo paguen. */
    onAccount: map.get("account")?.total ?? "0",
    collections,
    collected: addMoney("0", ...collections.map((c) => c.total)),
    cancelled: { count: totals?.cancelledCount ?? 0, total: totals?.cancelledTotal ?? "0" },
    first: totals?.first ?? null,
    last: totals?.last ?? null,
    units: items.reduce((a, i) => a + i.qty, 0),
    payments,
    items,
    sellers,
  };
}
