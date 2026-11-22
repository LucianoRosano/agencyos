import { addMoney, cmpMoney, notFound, subMoney, todayAR, validation, zMoney, zOptText } from "@agencyos/core";
import { getDb, schema, type Tx } from "@agencyos/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { COLLECT_METHODS, PAYMENT_LABEL, type ShopCtx, touch } from "./service";

/**
 * Cuenta corriente (fiado) de los clientes del comercio: cada venta «a cuenta» suma deuda, cada pago la baja.
 * Las ventas anuladas no cuentan. El saldo se calcula siempre de los movimientos (no se guarda aparte).
 */
async function customerOf(sc: ShopCtx, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await getDb()
    .select()
    .from(schema.shopCustomer)
    .where(and(eq(schema.shopCustomer.id, id), eq(schema.shopCustomer.shopId, sc.shopId)));
  return c ?? null;
}

export async function customerOwed(sc: ShopCtx, customerId: string, ex: Pick<Tx, "execute"> = getDb()) {
  const res = await ex.execute<{ owed: string }>(sql`
    select ((select coalesce(sum(total),0) from shop_sale where shop_id = ${sc.shopId} and customer_id = ${customerId} and status = 'completed' and payment_method = 'account')
          - (select coalesce(sum(amount),0) from shop_customer_payment where shop_id = ${sc.shopId} and customer_id = ${customerId}))::numeric(14,2)::text as owed`);
  return res.rows[0]?.owed ?? "0.00";
}

export const paymentInput = z.object({
  amount: zMoney.refine((v) => cmpMoney(v, "0") > 0, "Tiene que ser mayor a cero"),
  method: z.enum(COLLECT_METHODS).default("cash"),
  note: zOptText(300),
});

/** Registrar un pago a cuenta: no puede superar lo que debe. */
export async function registerCustomerPayment(sc: ShopCtx, customerId: string, raw: unknown) {
  const input = paymentInput.parse(raw);
  return getDb().transaction(async (t) => {
    const c = await customerOf(sc, customerId);
    if (!c) throw notFound("El cliente");
    // Serializa pagos simultáneos del mismo cliente.
    await t.select({ id: schema.shopCustomer.id }).from(schema.shopCustomer).where(eq(schema.shopCustomer.id, customerId)).for("update");
    const owed = await customerOwed(sc, customerId, t);
    if (cmpMoney(input.amount, owed) > 0) throw validation(`El pago supera lo que debe (${owed.replace(".", ",")})`, { amount: "Supera la deuda" });
    const [p] = await t
      .insert(schema.shopCustomerPayment)
      .values({ shopId: sc.shopId, createdBy: sc.userId, customerId, amount: input.amount, method: input.method, note: input.note ?? null, day: todayAR() })
      .returning();
    await touch(t, sc.shopId);
    return { payment: p, owed: subMoney(owed, input.amount) };
  });
}

/** Deshacer un pago (lo borra): solo el mismo día y del mismo comercio. */
export async function deleteCustomerPayment(sc: ShopCtx, paymentId: string) {
  if (sc.role === "seller") throw validation("Solo el dueño o un administrador pueden borrar pagos");
  const [p] = await getDb()
    .delete(schema.shopCustomerPayment)
    .where(and(eq(schema.shopCustomerPayment.id, paymentId), eq(schema.shopCustomerPayment.shopId, sc.shopId)))
    .returning();
  if (!p) throw notFound("El pago");
  return p;
}

export type StatementRow = { at: Date; kind: "sale" | "payment"; ref: string; detail: string; debit: string; credit: string; balance: string; id: string };

/** Estado de cuenta: ventas a cuenta y pagos, del más viejo al más nuevo, con saldo acumulado. */
export async function customerStatement(sc: ShopCtx, customerId: string) {
  const c = await customerOf(sc, customerId);
  if (!c) return null;
  const db = getDb();
  const [sales, payments] = await Promise.all([
    db
      .select({ id: schema.shopSale.id, at: schema.shopSale.soldAt, number: schema.shopSale.number, total: schema.shopSale.total })
      .from(schema.shopSale)
      .where(
        and(
          eq(schema.shopSale.shopId, sc.shopId),
          eq(schema.shopSale.customerId, customerId),
          eq(schema.shopSale.status, "completed"),
          eq(schema.shopSale.paymentMethod, "account"),
        ),
      )
      .orderBy(asc(schema.shopSale.soldAt)),
    db
      .select()
      .from(schema.shopCustomerPayment)
      .where(and(eq(schema.shopCustomerPayment.shopId, sc.shopId), eq(schema.shopCustomerPayment.customerId, customerId)))
      .orderBy(asc(schema.shopCustomerPayment.createdAt)),
  ]);
  const rows = [
    ...sales.map((s) => ({ at: s.at, kind: "sale" as const, ref: `Venta n.º ${s.number}`, detail: "", debit: s.total, credit: "0", id: s.id })),
    ...payments.map((p) => ({
      at: p.createdAt,
      kind: "payment" as const,
      ref: "Pago",
      detail: [PAYMENT_LABEL[p.method as keyof typeof PAYMENT_LABEL] ?? p.method, p.note].filter(Boolean).join(" · "),
      debit: "0",
      credit: p.amount,
      id: p.id,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  let bal = "0";
  const out: StatementRow[] = rows.map((r) => {
    bal = subMoney(addMoney(bal, r.debit), r.credit);
    return { ...r, balance: bal };
  });
  return { customer: c, rows: out, owed: bal };
}
