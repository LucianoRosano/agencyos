import { addDays, dayOfWeek, formatDate, formatMoney, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { emailConfigured, sendEmail } from "../shared/email";
import type { ShopCtx } from "./service";

/**
 * Reporte semanal automático de cada comercio (lunes a domingo): ventas, ticket promedio, comparación con la semana
 * anterior, mejores productos y día, pedidos y stock bajo. Lo genera el worker los lunes; queda en el panel y, si hay
 * Brevo y el comercio lo tiene activado, se manda por email al dueño y a los administradores.
 */
export type ShopReportData = {
  shopName: string;
  total: string;
  count: number;
  avgTicket: string;
  prevTotal: string;
  changePct: number | null;
  bestDay: { day: string; total: string } | null;
  top: { name: string; qty: number; total: string }[];
  byPayment: { method: string; total: string }[];
  ordersDelivered: number;
  ordersPending: number;
  lowStock: { name: string; stock: number; minStock: number }[];
};

export function lastWeek(today = todayAR()) {
  const monday = addDays(today, -((dayOfWeek(today) + 6) % 7));
  return { start: addDays(monday, -7), end: addDays(monday, -1) };
}

export async function buildReport(shopId: string, start: string, end: string): Promise<ShopReportData> {
  const db = getDb();
  const prevStart = addDays(start, -7);
  const prevEnd = addDays(start, -1);
  const [[shop], [k], top, best, pay, orders, low] = await Promise.all([
    db.select({ name: schema.shop.name }).from(schema.shop).where(eq(schema.shop.id, shopId)),
    db
      .execute<{ total: string; n: number; prev: string }>(sql`
        select coalesce(sum(total) filter (where day between ${start}::date and ${end}::date), 0)::text as total,
               count(*) filter (where day between ${start}::date and ${end}::date)::int as n,
               coalesce(sum(total) filter (where day between ${prevStart}::date and ${prevEnd}::date), 0)::text as prev
        from shop_sale where shop_id = ${shopId} and status = 'completed' and day between ${prevStart}::date and ${end}::date`)
      .then((r) => r.rows),
    db
      .execute<{ name: string; qty: number; total: string }>(sql`
        select i.name, sum(i.qty)::int as qty, sum(i.line_total)::text as total from shop_sale_item i join shop_sale v on v.id = i.sale_id
        where v.shop_id = ${shopId} and v.status = 'completed' and v.day between ${start}::date and ${end}::date
        group by i.name order by sum(i.line_total) desc limit 5`)
      .then((r) => r.rows),
    db
      .execute<{ day: string; total: string }>(sql`
        select day::text as day, sum(total)::text as total from shop_sale where shop_id = ${shopId} and status = 'completed'
        and day between ${start}::date and ${end}::date group by day order by sum(total) desc limit 1`)
      .then((r) => r.rows),
    db
      .execute<{ method: string; total: string }>(sql`
        select payment_method as method, sum(total)::text as total from shop_sale where shop_id = ${shopId} and status = 'completed'
        and day between ${start}::date and ${end}::date group by payment_method order by sum(total) desc`)
      .then((r) => r.rows),
    db
      .execute<{ delivered: number; pending: number }>(sql`
        select count(*) filter (where status = 'delivered' and updated_at::date between ${start}::date and ${end}::date)::int as delivered,
               count(*) filter (where status in ('new','preparing','ready'))::int as pending
        from shop_order where shop_id = ${shopId}`)
      .then((r) => r.rows),
    db
      .select({ name: schema.shopProduct.name, stock: schema.shopProduct.stock, minStock: schema.shopProduct.minStock })
      .from(schema.shopProduct)
      .where(
        and(eq(schema.shopProduct.shopId, shopId), eq(schema.shopProduct.active, true), sql`${schema.shopProduct.stock} <= ${schema.shopProduct.minStock}`),
      )
      .limit(20),
  ]);
  const total = k?.total ?? "0";
  const prev = k?.prev ?? "0";
  const count = k?.n ?? 0;
  const t = Number(total);
  const p = Number(prev);
  return {
    shopName: shop?.name ?? "",
    total,
    count,
    avgTicket: count ? (Math.round((t / count) * 100) / 100).toFixed(2) : "0",
    prevTotal: prev,
    changePct: p > 0 ? Math.round(((t - p) / p) * 100) : null,
    bestDay: best[0] ?? null,
    top,
    byPayment: pay,
    ordersDelivered: orders[0]?.delivered ?? 0,
    ordersPending: orders[0]?.pending ?? 0,
    lowStock: low,
  };
}

export function reportText(d: ShopReportData, start: string, end: string, currency = "ARS") {
  const lines = [
    `Resumen de ${d.shopName} · semana del ${formatDate(start)} al ${formatDate(end)}`,
    "",
    `Ventas: ${formatMoney(d.total, currency)} en ${d.count} operaciones (ticket promedio ${formatMoney(d.avgTicket, currency)}).`,
    d.changePct === null ? "" : `Comparado con la semana anterior: ${d.changePct >= 0 ? "+" : ""}${d.changePct} %.`,
    d.bestDay ? `Mejor día: ${formatDate(d.bestDay.day)} (${formatMoney(d.bestDay.total, currency)}).` : "",
    d.top.length ? `\nLo más vendido:\n${d.top.map((x) => `- ${x.name}: ${x.qty} u. · ${formatMoney(x.total, currency)}`).join("\n")}` : "",
    `\nPedidos entregados: ${d.ordersDelivered} · pendientes: ${d.ordersPending}.`,
    d.lowStock.length ? `\nStock bajo:\n${d.lowStock.map((x) => `- ${x.name}: quedan ${x.stock} (mínimo ${x.minStock})`).join("\n")}` : "",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

/** Job semanal (lunes, worker): un reporte por comercio activo para la semana anterior (idempotente). */
export async function generateWeeklyReports(today = todayAR()) {
  const { start, end } = lastWeek(today);
  const db = getDb();
  const shops = await db.select().from(schema.shop).where(eq(schema.shop.status, "active"));
  let made = 0;
  for (const s of shops) {
    const data = await buildReport(s.id, start, end);
    const [row] = await db.insert(schema.shopReport).values({ shopId: s.id, periodStart: start, periodEnd: end, data }).onConflictDoNothing().returning();
    if (!row) continue;
    made++;
    const settings = (s.settings ?? {}) as { weeklyReport?: boolean };
    if (settings.weeklyReport !== false && emailConfigured()) {
      const to = await db
        .select({ email: schema.user.email })
        .from(schema.shopMember)
        .innerJoin(schema.user, eq(schema.user.id, schema.shopMember.userId))
        .where(and(eq(schema.shopMember.shopId, s.id), eq(schema.shopMember.active, true), sql`${schema.shopMember.role} in ('owner','admin')`));
      let sent = false;
      for (const r of to)
        sent = (await sendEmail({ to: r.email, subject: `${s.name} · Resumen de la semana`, text: reportText(data, start, end, s.currency) })) || sent;
      if (sent) await db.update(schema.shopReport).set({ emailedAt: new Date() }).where(eq(schema.shopReport.id, row.id));
    }
  }
  return made;
}

export async function listReports(sc: ShopCtx) {
  return getDb().select().from(schema.shopReport).where(eq(schema.shopReport.shopId, sc.shopId)).orderBy(desc(schema.shopReport.periodStart)).limit(52);
}

/** Reporte de la semana en curso (a pedido, sin guardarlo). */
export async function currentWeekReport(sc: ShopCtx, today = todayAR()) {
  const monday = addDays(today, -((dayOfWeek(today) + 6) % 7));
  return { start: monday, end: today, data: await buildReport(sc.shopId, monday, today) };
}
