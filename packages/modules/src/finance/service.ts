import {
  addDays,
  addMonths,
  assertCan,
  type Ctx,
  cmpMoney,
  formatMoney,
  fromCents,
  L,
  label,
  notFound,
  subMoney,
  systemCtx,
  toCents,
  todayAR,
  validation,
  zCurrency,
  zDate,
  zInt,
  zMoney,
  zOptUuid,
  zPositiveMoney,
  zRequired,
} from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema, type Tx, uuidv7 } from "@agencyos/db";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, scoped } from "../shared/db";

/**
 * Gestión financiera (docs/02 M05). Sin facturación fiscal.
 * Montos: siempre strings con 2 decimales y helpers de core (nunca float).
 * Tipo de cambio: `exchangeRate` es la cotización en ARS por 1 USD (`rateBaseCurrency = "ARS"`).
 */

export const ACCOUNT_KINDS = ["cash", "bank", "wallet", "usd", "other"] as const;
export const FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export const SUB_STATUSES = ["active", "paused", "cancelled"] as const;
const OPEN = ["pending", "partial", "overdue"] as const;

const empty = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
/** Texto opcional: "" → undefined (el `zOptText` de core rechaza el string vacío que manda un FormData). */
const zOptText = (max: number) => z.preprocess(empty, z.string().trim().max(max, `Máximo ${max} caracteres`).optional());
/** Cotización opcional (ARS por US$ 1), hasta 4 decimales. */
export const zOptRate = z.preprocess(
  (v) =>
    typeof v === "string"
      ? empty(
          v
            .trim()
            .replace(/\./g, (m, _i, s: string) => (s.includes(",") ? "" : m))
            .replace(",", "."),
        )
      : v,
  z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Cotización inválida")
    .refine((v) => Number(v) > 0, "La cotización debe ser mayor a cero")
    .optional(),
);
const zOptMoneyLocal = z.preprocess(empty, zPositiveMoney.optional());

async function lockWorkspace(t: Tx, ctx: Ctx) {
  await t.execute(sql`select id from workspace where id = ${ctx.workspaceId} for update`);
}

async function getAccount(t: Tx, ctx: Ctx, id: string) {
  const [a] = await t
    .select()
    .from(schema.moneyAccount)
    .where(and(eq(schema.moneyAccount.id, id), scoped(schema.moneyAccount, ctx)));
  if (!a) throw validation("La cuenta no existe", { accountId: "Elegí una cuenta" });
  return a;
}

async function checkCategory(t: Tx, ctx: Ctx, id: string | undefined, kind: "income" | "expense") {
  if (!id) return null;
  const [c] = await t
    .select()
    .from(schema.category)
    .where(and(eq(schema.category.id, id), scoped(schema.category, ctx)));
  if (!c)
    throw validation("La categoría no existe", {
      categoryId: "Elegí otra categoría",
    });
  if (c.kind !== kind)
    throw validation("La categoría no corresponde al tipo de movimiento", {
      categoryId: kind === "income" ? "Elegí una categoría de ingresos" : "Elegí una categoría de gastos",
    });
  return c;
}

async function checkLinks(t: Tx, ctx: Ctx, clientId?: string, projectId?: string) {
  if (clientId) {
    const [c] = await t
      .select({ id: schema.client.id })
      .from(schema.client)
      .where(and(eq(schema.client.id, clientId), scoped(schema.client, ctx)));
    if (!c)
      throw validation("El cliente no existe", {
        clientId: "Elegí otro cliente",
      });
  }
  if (projectId) {
    const [p] = await t
      .select({ id: schema.project.id, clientId: schema.project.clientId })
      .from(schema.project)
      .where(and(eq(schema.project.id, projectId), scoped(schema.project, ctx)));
    if (!p)
      throw validation("El proyecto no existe", {
        projectId: "Elegí otro proyecto",
      });
    return p;
  }
  return null;
}

async function checkLedger(t: Tx, ctx: Ctx, id: string) {
  const [l] = await t
    .select()
    .from(schema.ledger)
    .where(and(eq(schema.ledger.id, id), scoped(schema.ledger, ctx)));
  if (!l) throw validation("El libro no existe", { ledgerId: "Elegí un libro" });
  return l;
}

/** La cotización se guarda siempre como ARS por US$ 1 (`rateBaseCurrency = "ARS"`). */
const rateFields = (rate: string | undefined) => (rate ? { exchangeRate: rate, rateBaseCurrency: "ARS" } : { exchangeRate: null, rateBaseCurrency: null });

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------
export const accountInput = z.object({
  name: zRequired(80, "El nombre"),
  ledgerId: z.string({ error: "Elegí el libro" }).uuid("Elegí el libro"),
  kind: z.enum(ACCOUNT_KINDS).default("cash"),
  currency: zCurrency.default("ARS"),
  openingBalance: z.preprocess((v) => empty(v) ?? "0", zMoney),
  openingDate: z.preprocess(empty, zDate.optional()),
});

export async function createAccount(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "finance");
  const input = accountInput.parse(raw);
  return getDb().transaction(async (t) => {
    const ledger = await checkLedger(t, ctx, input.ledgerId);
    const [row] = await t
      .insert(schema.moneyAccount)
      .values({
        ...input,
        openingDate: input.openingDate ?? todayAR(),
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear la cuenta");
    await recordEvent(t, ctx, {
      type: "cuenta.creada",
      entityType: "account",
      entityId: row.id,
      summary: `Creó la cuenta «${row.name}» (${ledger.name}, ${row.currency})`,
    });
    return row;
  });
}

export async function updateAccount(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "finance");
  const input = accountInput.parse(raw);
  return getDb().transaction(async (t) => {
    const before = await getAccount(t, ctx, id).catch(() => null);
    if (!before) throw notFound("La cuenta");
    await checkLedger(t, ctx, input.ledgerId);
    if (before.currency !== input.currency || before.ledgerId !== input.ledgerId) {
      const [{ n } = { n: 0 }] = await t
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.transaction)
        .where(and(eq(schema.transaction.accountId, id), scoped(schema.transaction, ctx)));
      if (n > 0) {
        if (before.currency !== input.currency)
          throw validation("La cuenta ya tiene movimientos: no se puede cambiar la moneda", { currency: "Tiene movimientos" });
        throw validation("La cuenta ya tiene movimientos: no se puede cambiar de libro", { ledgerId: "Tiene movimientos" });
      }
    }
    const [row] = await t
      .update(schema.moneyAccount)
      .set({ ...input, openingDate: input.openingDate ?? before.openingDate })
      .where(eq(schema.moneyAccount.id, id))
      .returning();
    await recordEvent(t, ctx, {
      type: "cuenta.actualizada",
      entityType: "account",
      entityId: id,
      summary: `Editó la cuenta «${input.name}»`,
    });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Categorías (jerárquicas, 2 niveles)
// ---------------------------------------------------------------------------
export const categoryInput = z.object({
  name: zRequired(80, "El nombre"),
  kind: z.enum(["income", "expense"], { error: "Elegí el tipo" }),
  parentId: zOptUuid,
});

export async function createCategory(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "finance");
  const input = categoryInput.parse(raw);
  return getDb().transaction(async (t) => {
    if (input.parentId) {
      const [p] = await t
        .select()
        .from(schema.category)
        .where(and(eq(schema.category.id, input.parentId), scoped(schema.category, ctx)));
      if (!p)
        throw validation("La categoría madre no existe", {
          parentId: "Elegí otra",
        });
      if (p.kind !== input.kind)
        throw validation("La categoría madre es de otro tipo", {
          parentId: "Tiene que ser del mismo tipo",
        });
      if (p.parentId)
        throw validation("Solo se admiten dos niveles", {
          parentId: "Elegí una categoría principal",
        });
    }
    const [row] = await t
      .insert(schema.category)
      .values({
        ...input,
        parentId: input.parentId ?? null,
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear la categoría");
    await recordEvent(t, ctx, {
      type: "categoria.creada",
      entityType: "category",
      entityId: row.id,
      summary: `Creó la categoría «${row.name}»`,
    });
    return row;
  });
}

export async function renameCategory(ctx: Ctx, id: string, name: string) {
  assertCan(ctx, "update", "finance");
  const n = zRequired(80, "El nombre").parse(name);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.category)
      .set({ name: n })
      .where(and(eq(schema.category.id, id), scoped(schema.category, ctx)))
      .returning();
    if (!row) throw notFound("La categoría");
    await recordEvent(t, ctx, {
      type: "categoria.renombrada",
      entityType: "category",
      entityId: id,
      summary: `Renombró la categoría a «${n}»`,
    });
    return row;
  });
}

/** Papelera de categorías (también sus subcategorías). Los movimientos conservan la referencia. */
export async function trashCategory(ctx: Ctx, id: string, restore = false) {
  assertCan(ctx, "delete", "finance");
  return getDb().transaction(async (t) => {
    const where = and(eq(schema.category.workspaceId, ctx.workspaceId), sql`(${schema.category.id} = ${id} or ${schema.category.parentId} = ${id})`);
    const rows = await t
      .update(schema.category)
      .set({ deletedAt: restore ? null : new Date() })
      .where(where)
      .returning();
    const main = rows.find((r) => r.id === id);
    if (!main) throw notFound("La categoría");
    await recordEvent(t, ctx, {
      type: restore ? "categoria.restaurada" : "categoria.eliminada",
      entityType: "category",
      entityId: id,
      summary: `${restore ? "Restauró" : "Envió a la papelera"} la categoría «${main.name}»`,
    });
    return main;
  });
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------
export const txInput = z.object({
  kind: z.enum(["income", "expense"], { error: "Elegí ingreso o gasto" }),
  date: z.preprocess(empty, zDate.optional()),
  amount: zPositiveMoney,
  accountId: z.string({ error: "Elegí una cuenta" }).uuid("Elegí una cuenta"),
  exchangeRate: zOptRate,
  categoryId: zOptUuid,
  clientId: zOptUuid,
  projectId: zOptUuid,
  counterpart: zOptText(160),
  description: zOptText(500),
});

type TxExtra = {
  receivableId?: string;
  payableId?: string;
  subscriptionId?: string;
  description?: string;
};

async function insertTx(t: Tx, ctx: Ctx, input: z.infer<typeof txInput>, extra: TxExtra = {}) {
  const account = await getAccount(t, ctx, input.accountId);
  await checkCategory(t, ctx, input.categoryId, input.kind);
  const project = await checkLinks(t, ctx, input.clientId, input.projectId);
  const [row] = await t
    .insert(schema.transaction)
    .values({
      workspaceId: ctx.workspaceId,
      createdBy: ctx.userId,
      ledgerId: account.ledgerId,
      accountId: account.id,
      kind: input.kind,
      date: input.date ?? todayAR(),
      amount: input.amount,
      currency: account.currency,
      ...rateFields(input.exchangeRate),
      categoryId: input.categoryId ?? null,
      clientId: input.clientId ?? project?.clientId ?? null,
      projectId: input.projectId ?? null,
      counterpart: input.counterpart ?? null,
      description: extra.description ?? input.description ?? null,
      receivableId: extra.receivableId ?? null,
      payableId: extra.payableId ?? null,
      subscriptionId: extra.subscriptionId ?? null,
    })
    .returning();
  if (!row) throw new Error("No se pudo registrar el movimiento");
  return { row, account };
}

export async function createTransaction(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "finance");
  const input = txInput.parse(raw);
  return getDb().transaction(async (t) => {
    const { row, account } = await insertTx(t, ctx, input);
    await recordEvent(t, ctx, {
      type: "movimiento.registrado",
      entityType: "transaction",
      entityId: row.id,
      summary: `Registró un ${label(L.txKind, row.kind).toLowerCase()} de ${formatMoney(row.amount, row.currency)} en «${account.name}»${row.description ? `: ${row.description}` : ""}`,
      payload: { kind: row.kind, amount: row.amount, currency: row.currency },
    });
    return row;
  });
}

export async function updateTransaction(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "finance");
  const input = txInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [before] = await t
      .select()
      .from(schema.transaction)
      .where(and(eq(schema.transaction.id, id), scoped(schema.transaction, ctx)));
    if (!before) throw notFound("El movimiento");
    if (before.transferPairId) throw validation("Las transferencias no se editan: eliminala y registrala de nuevo");
    if (before.kind !== input.kind && (before.receivableId || before.payableId || before.subscriptionId))
      throw validation("Este movimiento está vinculado a un cobro, pago o suscripción: no se puede cambiar el tipo");
    const account = await getAccount(t, ctx, input.accountId);
    await checkCategory(t, ctx, input.categoryId, input.kind);
    const project = await checkLinks(t, ctx, input.clientId, input.projectId);
    const [row] = await t
      .update(schema.transaction)
      .set({
        ledgerId: account.ledgerId,
        accountId: account.id,
        kind: input.kind,
        date: input.date ?? before.date,
        amount: input.amount,
        currency: account.currency,
        ...rateFields(input.exchangeRate),
        categoryId: input.categoryId ?? null,
        clientId: input.clientId ?? project?.clientId ?? null,
        projectId: input.projectId ?? null,
        counterpart: input.counterpart ?? null,
        description: input.description ?? null,
      })
      .where(eq(schema.transaction.id, id))
      .returning();
    if (!row) throw notFound("El movimiento");
    if (before.receivableId) await recalcReceivable(t, before.receivableId);
    if (before.payableId) await recalcPayable(t, before.payableId);
    await recordEvent(t, ctx, {
      type: "movimiento.actualizado",
      entityType: "transaction",
      entityId: id,
      summary: `Editó un ${label(L.txKind, row.kind).toLowerCase()} de ${formatMoney(row.amount, row.currency)}`,
    });
    return row;
  });
}

export const transferInput = z
  .object({
    date: z.preprocess(empty, zDate.optional()),
    fromAccountId: z.string({ error: "Elegí la cuenta de origen" }).uuid("Elegí la cuenta de origen"),
    toAccountId: z.string({ error: "Elegí la cuenta de destino" }).uuid("Elegí la cuenta de destino"),
    amount: zPositiveMoney,
    toAmount: zOptMoneyLocal,
    description: zOptText(500),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    path: ["toAccountId"],
    message: "Elegí una cuenta distinta a la de origen",
  });

/** Transferencia entre cuentas: dos filas (`transfer_out` / `transfer_in`) con el mismo `transferPairId`. */
export async function createTransfer(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "finance");
  const input = transferInput.parse(raw);
  return getDb().transaction(async (t) => {
    const from = await getAccount(t, ctx, input.fromAccountId);
    const to = await getAccount(t, ctx, input.toAccountId).catch(() => {
      throw validation("La cuenta de destino no existe", {
        toAccountId: "Elegí otra cuenta",
      });
    });
    const sameCurrency = from.currency === to.currency;
    if (!sameCurrency && !input.toAmount)
      throw validation("Las cuentas tienen distinta moneda: indicá cuánto llega", { toAmount: `Monto acreditado en ${to.currency}` });
    const toAmount = sameCurrency ? input.amount : (input.toAmount as string);
    // Cotización implícita ARS por US$ 1 (4 decimales), si es un cambio ARS↔USD.
    let rate: string | null = null;
    if (!sameCurrency && [from.currency, to.currency].sort().join() === "ARS,USD") {
      const ars = toCents(from.currency === "ARS" ? input.amount : toAmount);
      const usd = toCents(from.currency === "USD" ? input.amount : toAmount);
      const r = (ars * 10000n * 2n + usd) / (usd * 2n); // redondeo half-up
      rate = `${r / 10000n}.${(r % 10000n).toString().padStart(4, "0")}`;
    }
    const pair = uuidv7();
    const date = input.date ?? todayAR();
    const base = {
      workspaceId: ctx.workspaceId,
      createdBy: ctx.userId,
      date,
      transferPairId: pair,
      description: input.description ?? null,
      exchangeRate: rate,
      rateBaseCurrency: rate ? "ARS" : null,
    };
    const rows = await t
      .insert(schema.transaction)
      .values([
        {
          ...base,
          ledgerId: from.ledgerId,
          accountId: from.id,
          kind: "transfer_out",
          amount: input.amount,
          currency: from.currency,
          counterpart: to.name,
        },
        {
          ...base,
          ledgerId: to.ledgerId,
          accountId: to.id,
          kind: "transfer_in",
          amount: toAmount,
          currency: to.currency,
          counterpart: from.name,
        },
      ])
      .returning();
    await recordEvent(t, ctx, {
      type: "movimiento.registrado",
      entityType: "transaction",
      entityId: rows[0]?.id,
      summary: `Transfirió ${formatMoney(input.amount, from.currency)} de «${from.name}» a «${to.name}»`,
      payload: { kind: "transfer", pair },
    });
    return { pair, rows };
  });
}

/** Elimina (papelera) un movimiento; si es transferencia, ambas filas. Recalcula cobros/pagos vinculados. */
export async function deleteTransaction(ctx: Ctx, id: string, restore = false) {
  assertCan(ctx, "delete", "finance");
  return getDb().transaction(async (t) => {
    const [tx] = await t
      .select()
      .from(schema.transaction)
      .where(and(eq(schema.transaction.id, id), eq(schema.transaction.workspaceId, ctx.workspaceId)));
    if (!tx) throw notFound("El movimiento");
    const where = tx.transferPairId
      ? and(eq(schema.transaction.workspaceId, ctx.workspaceId), eq(schema.transaction.transferPairId, tx.transferPairId))
      : eq(schema.transaction.id, id);
    await t
      .update(schema.transaction)
      .set({ deletedAt: restore ? null : new Date() })
      .where(where);
    if (tx.receivableId) await recalcReceivable(t, tx.receivableId);
    if (tx.payableId) await recalcPayable(t, tx.payableId);
    await recordEvent(t, ctx, {
      type: restore ? "movimiento.restaurado" : "movimiento.eliminado",
      entityType: "transaction",
      entityId: id,
      summary: `${restore ? "Restauró" : "Envió a la papelera"} ${tx.transferPairId ? "una transferencia" : `un ${label(L.txKind, tx.kind).toLowerCase()}`} de ${formatMoney(tx.amount, tx.currency)}`,
    });
    return tx;
  });
}

// ---------------------------------------------------------------------------
// Estado de cobros y pagos
// ---------------------------------------------------------------------------
export function computeStatus(amount: string, paid: string, dueDate: string | null, current: string, today = todayAR()) {
  if (current === "void") return "void";
  if (cmpMoney(paid, amount) >= 0) return "paid";
  if (dueDate && dueDate < today) return "overdue";
  if (cmpMoney(paid, 0) > 0) return "partial";
  return "pending";
}

async function recalcReceivable(t: Tx, id: string) {
  const [r] = await t.select().from(schema.receivable).where(eq(schema.receivable.id, id));
  if (!r) return null;
  const [s] = await t
    .select({
      paid: sql<string>`coalesce(sum(${schema.transaction.amount}), 0)::text`,
    })
    .from(schema.transaction)
    .where(and(eq(schema.transaction.receivableId, id), isNull(schema.transaction.deletedAt), eq(schema.transaction.kind, "income")));
  const paid = fromCents(toCents(s?.paid ?? "0"));
  const status = computeStatus(r.amount, paid, r.dueDate, r.status);
  const [row] = await t.update(schema.receivable).set({ paidAmount: paid, status }).where(eq(schema.receivable.id, id)).returning();
  return row ?? null;
}

async function recalcPayable(t: Tx, id: string) {
  const [p] = await t.select().from(schema.payable).where(eq(schema.payable.id, id));
  if (!p) return null;
  const [s] = await t
    .select({
      paid: sql<string>`coalesce(sum(${schema.transaction.amount}), 0)::text`,
    })
    .from(schema.transaction)
    .where(and(eq(schema.transaction.payableId, id), isNull(schema.transaction.deletedAt), eq(schema.transaction.kind, "expense")));
  const paid = fromCents(toCents(s?.paid ?? "0"));
  const status = computeStatus(p.amount, paid, p.dueDate, p.status);
  const [row] = await t.update(schema.payable).set({ paidAmount: paid, status }).where(eq(schema.payable.id, id)).returning();
  return row ?? null;
}

/** Número de constancia interna "C-AAAA-NNNN" (correlativo por año, incluye anulados para no reutilizar números). */
async function nextReceiptNumber(t: Tx, ctx: Ctx, date: string) {
  await lockWorkspace(t, ctx);
  const year = date.slice(0, 4);
  const [r] = await t
    .select({
      n: sql<number>`coalesce(max(substring(${schema.transaction.description} from ${`C-${year}-(\\d{4,})`}::text)::int), 0)::int`,
    })
    .from(schema.transaction)
    .where(and(eq(schema.transaction.workspaceId, ctx.workspaceId), sql`${schema.transaction.receivableId} is not null`));
  return `C-${year}-${String((r?.n ?? 0) + 1).padStart(4, "0")}`;
}

export const RECEIPT_RE = /C-\d{4}-\d{4,}/;

// --- Por cobrar ---
export const receivableInput = z.object({
  clientId: z.string({ error: "Elegí el cliente" }).uuid("Elegí el cliente"),
  projectId: zOptUuid,
  concept: zRequired(200, "El concepto"),
  amount: zPositiveMoney,
  currency: zCurrency.default("ARS"),
  dueDate: z.preprocess(empty, zDate.optional()),
});

export async function createReceivable(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "finance");
  const input = receivableInput.parse(raw);
  return getDb().transaction(async (t) => {
    await checkLinks(t, ctx, input.clientId, input.projectId);
    const [row] = await t
      .insert(schema.receivable)
      .values({
        ...input,
        projectId: input.projectId ?? null,
        dueDate: input.dueDate ?? null,
        status: computeStatus(input.amount, "0", input.dueDate ?? null, "pending"),
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear el cobro");
    await recordEvent(t, ctx, {
      type: "cobro.creado",
      entityType: "receivable",
      entityId: row.id,
      summary: `Agregó un cobro pendiente: «${row.concept}» por ${formatMoney(row.amount, row.currency)}`,
    });
    return row;
  });
}

export async function updateReceivable(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "finance");
  const input = receivableInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [before] = await t
      .select()
      .from(schema.receivable)
      .where(and(eq(schema.receivable.id, id), scoped(schema.receivable, ctx)));
    if (!before) throw notFound("El cobro");
    if (before.currency !== input.currency && cmpMoney(before.paidAmount, 0) > 0)
      throw validation("Ya tiene cobros registrados: no se puede cambiar la moneda", { currency: "Tiene cobros" });
    await checkLinks(t, ctx, input.clientId, input.projectId);
    await t
      .update(schema.receivable)
      .set({
        ...input,
        projectId: input.projectId ?? null,
        dueDate: input.dueDate ?? null,
      })
      .where(eq(schema.receivable.id, id));
    const row = await recalcReceivable(t, id);
    await recordEvent(t, ctx, {
      type: "cobro.actualizado",
      entityType: "receivable",
      entityId: id,
      summary: `Editó el cobro «${input.concept}»`,
    });
    return row;
  });
}

export async function voidReceivable(ctx: Ctx, id: string, undo = false) {
  assertCan(ctx, "update", "finance");
  return getDb().transaction(async (t) => {
    const [r] = await t
      .select()
      .from(schema.receivable)
      .where(and(eq(schema.receivable.id, id), scoped(schema.receivable, ctx)));
    if (!r) throw notFound("El cobro");
    await t
      .update(schema.receivable)
      .set({ status: undo ? "pending" : "void" })
      .where(eq(schema.receivable.id, id));
    const row = undo ? await recalcReceivable(t, id) : { ...r, status: "void" };
    await recordEvent(t, ctx, {
      type: undo ? "cobro.reactivado" : "cobro.anulado",
      entityType: "receivable",
      entityId: id,
      summary: `${undo ? "Reactivó" : "Anuló"} el cobro «${r.concept}»`,
    });
    return row;
  });
}

export const collectInput = z.object({
  amount: zPositiveMoney,
  date: z.preprocess(empty, zDate.optional()),
  accountId: z.string({ error: "Elegí la cuenta" }).uuid("Elegí la cuenta"),
  categoryId: zOptUuid,
});

/** Registrar cobro (total o parcial): crea el ingreso con `receivableId` y actualiza saldo y estado. */
export async function registerCollection(ctx: Ctx, receivableId: string, raw: unknown) {
  assertCan(ctx, "create", "finance");
  const input = collectInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [r] = await t
      .select()
      .from(schema.receivable)
      .where(and(eq(schema.receivable.id, receivableId), scoped(schema.receivable, ctx)))
      .for("update");
    if (!r) throw notFound("El cobro");
    if (r.status === "void") throw validation("El cobro está anulado");
    const remaining = subMoney(r.amount, r.paidAmount);
    if (cmpMoney(remaining, 0) <= 0) throw validation("Este cobro ya está saldado");
    if (cmpMoney(input.amount, remaining) > 0)
      throw validation(`El monto supera el saldo pendiente (${formatMoney(remaining, r.currency)})`, {
        amount: `Máximo ${formatMoney(remaining, r.currency)}`,
      });
    const account = await getAccount(t, ctx, input.accountId);
    if (account.currency !== r.currency)
      throw validation(`El cobro es en ${r.currency}: elegí una cuenta en ${r.currency}`, { accountId: `Cuenta en ${r.currency}` });
    const date = input.date ?? todayAR();
    const number = await nextReceiptNumber(t, ctx, date);
    const { row } = await insertTx(
      t,
      ctx,
      {
        kind: "income",
        date,
        amount: input.amount,
        accountId: account.id,
        categoryId: input.categoryId,
        clientId: r.clientId,
        projectId: r.projectId ?? undefined,
        exchangeRate: undefined,
        counterpart: undefined,
        description: undefined,
      },
      { receivableId: r.id, description: `${number} · ${r.concept}` },
    );
    const updated = await recalcReceivable(t, r.id);
    const [c] = await t.select({ name: schema.client.name }).from(schema.client).where(eq(schema.client.id, r.clientId));
    await recordEvent(t, ctx, {
      type: "cobro.registrado",
      entityType: "receivable",
      entityId: r.id,
      summary: `Cobró ${formatMoney(input.amount, r.currency)} a ${c?.name ?? "cliente"} por «${r.concept}»${updated?.status === "paid" ? " (saldado)" : ""}`,
      payload: {
        transactionId: row.id,
        number,
        amount: input.amount,
        currency: r.currency,
      },
    });
    return { transaction: row, receivable: updated, number };
  });
}

// --- Por pagar ---
export const payableInput = z.object({
  ledgerId: z.string({ error: "Elegí el libro" }).uuid("Elegí el libro"),
  counterpart: zRequired(160, "A quién le pagás"),
  concept: zRequired(200, "El concepto"),
  amount: zPositiveMoney,
  currency: zCurrency.default("ARS"),
  dueDate: z.preprocess(empty, zDate.optional()),
});

export async function createPayable(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "finance");
  const input = payableInput.parse(raw);
  return getDb().transaction(async (t) => {
    await checkLedger(t, ctx, input.ledgerId);
    const [row] = await t
      .insert(schema.payable)
      .values({
        ...input,
        dueDate: input.dueDate ?? null,
        status: computeStatus(input.amount, "0", input.dueDate ?? null, "pending"),
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear el pago");
    await recordEvent(t, ctx, {
      type: "pago.creado",
      entityType: "payable",
      entityId: row.id,
      summary: `Agregó un pago pendiente a ${row.counterpart}: «${row.concept}» por ${formatMoney(row.amount, row.currency)}`,
    });
    return row;
  });
}

export async function updatePayable(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "finance");
  const input = payableInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [before] = await t
      .select()
      .from(schema.payable)
      .where(and(eq(schema.payable.id, id), scoped(schema.payable, ctx)));
    if (!before) throw notFound("El pago");
    if (before.currency !== input.currency && cmpMoney(before.paidAmount, 0) > 0)
      throw validation("Ya tiene pagos registrados: no se puede cambiar la moneda", { currency: "Tiene pagos" });
    await checkLedger(t, ctx, input.ledgerId);
    await t
      .update(schema.payable)
      .set({ ...input, dueDate: input.dueDate ?? null })
      .where(eq(schema.payable.id, id));
    const row = await recalcPayable(t, id);
    await recordEvent(t, ctx, {
      type: "pago.actualizado",
      entityType: "payable",
      entityId: id,
      summary: `Editó el pago «${input.concept}»`,
    });
    return row;
  });
}

export async function voidPayable(ctx: Ctx, id: string, undo = false) {
  assertCan(ctx, "update", "finance");
  return getDb().transaction(async (t) => {
    const [p] = await t
      .select()
      .from(schema.payable)
      .where(and(eq(schema.payable.id, id), scoped(schema.payable, ctx)));
    if (!p) throw notFound("El pago");
    await t
      .update(schema.payable)
      .set({ status: undo ? "pending" : "void" })
      .where(eq(schema.payable.id, id));
    const row = undo ? await recalcPayable(t, id) : { ...p, status: "void" };
    await recordEvent(t, ctx, {
      type: undo ? "pago.reactivado" : "pago.anulado",
      entityType: "payable",
      entityId: id,
      summary: `${undo ? "Reactivó" : "Anuló"} el pago «${p.concept}»`,
    });
    return row;
  });
}

export const payInput = z.object({
  amount: zPositiveMoney,
  date: z.preprocess(empty, zDate.optional()),
  accountId: z.string({ error: "Elegí la cuenta" }).uuid("Elegí la cuenta"),
  categoryId: zOptUuid,
});

/** Registrar pago (total o parcial) de una deuda: crea el gasto con `payableId`. */
export async function registerPayablePayment(ctx: Ctx, payableId: string, raw: unknown) {
  assertCan(ctx, "create", "finance");
  const input = payInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [p] = await t
      .select()
      .from(schema.payable)
      .where(and(eq(schema.payable.id, payableId), scoped(schema.payable, ctx)))
      .for("update");
    if (!p) throw notFound("El pago");
    if (p.status === "void") throw validation("El pago está anulado");
    const remaining = subMoney(p.amount, p.paidAmount);
    if (cmpMoney(remaining, 0) <= 0) throw validation("Este pago ya está saldado");
    if (cmpMoney(input.amount, remaining) > 0)
      throw validation(`El monto supera el saldo pendiente (${formatMoney(remaining, p.currency)})`, {
        amount: `Máximo ${formatMoney(remaining, p.currency)}`,
      });
    const account = await getAccount(t, ctx, input.accountId);
    if (account.currency !== p.currency)
      throw validation(`El pago es en ${p.currency}: elegí una cuenta en ${p.currency}`, { accountId: `Cuenta en ${p.currency}` });
    const { row } = await insertTx(
      t,
      ctx,
      {
        kind: "expense",
        date: input.date,
        amount: input.amount,
        accountId: account.id,
        categoryId: input.categoryId,
        counterpart: p.counterpart,
        description: p.concept,
        clientId: undefined,
        projectId: undefined,
        exchangeRate: undefined,
      },
      { payableId: p.id },
    );
    const updated = await recalcPayable(t, p.id);
    await recordEvent(t, ctx, {
      type: "pago.registrado",
      entityType: "payable",
      entityId: p.id,
      summary: `Pagó ${formatMoney(input.amount, p.currency)} a ${p.counterpart} por «${p.concept}»${updated?.status === "paid" ? " (saldado)" : ""}`,
      payload: {
        transactionId: row.id,
        amount: input.amount,
        currency: p.currency,
      },
    });
    return { transaction: row, payable: updated };
  });
}

// ---------------------------------------------------------------------------
// Suscripciones / gastos fijos
// ---------------------------------------------------------------------------
export function advanceDue(date: string, frequency: string, interval = 1) {
  const n = Math.max(1, interval);
  if (frequency === "weekly") return addDays(date, 7 * n);
  if (frequency === "yearly") return addMonths(date, 12 * n);
  return addMonths(date, n);
}

export const subscriptionInput = z.object({
  ledgerId: z.string({ error: "Elegí el libro" }).uuid("Elegí el libro"),
  vendor: zRequired(120, "El proveedor"),
  description: zOptText(300),
  amount: zPositiveMoney,
  currency: zCurrency.default("ARS"),
  frequency: z.enum(FREQUENCIES).default("monthly"),
  intervalCount: zInt(1, 36).default(1),
  nextDue: z.string({ error: "La próxima fecha es obligatoria" }).regex(/^\d{4}-\d{2}-\d{2}$/, "La próxima fecha es obligatoria"),
  accountId: zOptUuid,
  categoryId: zOptUuid,
  notifyDaysBefore: zInt(0, 60).default(3),
  status: z.enum(SUB_STATUSES).default("active"),
});

async function checkSubRefs(t: Tx, ctx: Ctx, input: z.infer<typeof subscriptionInput>) {
  await checkLedger(t, ctx, input.ledgerId);
  if (input.accountId) {
    const a = await getAccount(t, ctx, input.accountId);
    if (a.currency !== input.currency)
      throw validation(`La cuenta es en ${a.currency} y la suscripción en ${input.currency}`, { accountId: `Elegí una cuenta en ${input.currency}` });
  }
  await checkCategory(t, ctx, input.categoryId, "expense");
}

export async function createSubscription(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "finance");
  const input = subscriptionInput.parse(raw);
  return getDb().transaction(async (t) => {
    await checkSubRefs(t, ctx, input);
    const [row] = await t
      .insert(schema.subscription)
      .values({
        ...input,
        accountId: input.accountId ?? null,
        categoryId: input.categoryId ?? null,
        description: input.description ?? null,
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear la suscripción");
    await recordEvent(t, ctx, {
      type: "suscripcion.creada",
      entityType: "subscription",
      entityId: row.id,
      summary: `Agregó la suscripción ${row.vendor} (${formatMoney(row.amount, row.currency)} · ${label(L.frequency, row.frequency).toLowerCase()})`,
    });
    return row;
  });
}

export async function updateSubscription(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "finance");
  const input = subscriptionInput.parse(raw);
  return getDb().transaction(async (t) => {
    await checkSubRefs(t, ctx, input);
    const [row] = await t
      .update(schema.subscription)
      .set({
        ...input,
        accountId: input.accountId ?? null,
        categoryId: input.categoryId ?? null,
        description: input.description ?? null,
      })
      .where(and(eq(schema.subscription.id, id), scoped(schema.subscription, ctx)))
      .returning();
    if (!row) throw notFound("La suscripción");
    await recordEvent(t, ctx, {
      type: "suscripcion.actualizada",
      entityType: "subscription",
      entityId: id,
      summary: `Editó la suscripción ${row.vendor}`,
    });
    return row;
  });
}

export async function setSubscriptionStatus(ctx: Ctx, id: string, status: (typeof SUB_STATUSES)[number]) {
  assertCan(ctx, "update", "finance");
  const s = z.enum(SUB_STATUSES).parse(status);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.subscription)
      .set({ status: s })
      .where(and(eq(schema.subscription.id, id), scoped(schema.subscription, ctx)))
      .returning();
    if (!row) throw notFound("La suscripción");
    await recordEvent(t, ctx, {
      type: "suscripcion.estado_cambiado",
      entityType: "subscription",
      entityId: id,
      summary: `${row.vendor}: ${label(L.subscriptionStatus, s).toLowerCase()}`,
    });
    return row;
  });
}

export const subPaymentInput = z.object({
  amount: zPositiveMoney,
  date: z.preprocess(empty, zDate.optional()),
  accountId: z.string({ error: "Elegí la cuenta" }).uuid("Elegí la cuenta"),
});

/** "Registrar pago": crea el gasto con `subscriptionId` y avanza `nextDue` un período. */
export async function registerSubscriptionPayment(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "create", "finance");
  const input = subPaymentInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [s] = await t
      .select()
      .from(schema.subscription)
      .where(and(eq(schema.subscription.id, id), scoped(schema.subscription, ctx)));
    if (!s) throw notFound("La suscripción");
    if (s.status === "cancelled") throw validation("La suscripción está cancelada");
    const account = await getAccount(t, ctx, input.accountId);
    if (account.currency !== s.currency)
      throw validation(`La suscripción es en ${s.currency}: elegí una cuenta en ${s.currency}`, { accountId: `Cuenta en ${s.currency}` });
    const { row } = await insertTx(
      t,
      ctx,
      {
        kind: "expense",
        date: input.date,
        amount: input.amount,
        accountId: account.id,
        categoryId: s.categoryId ?? undefined,
        counterpart: s.vendor,
        description: s.description ?? `Pago ${s.vendor}`,
        clientId: undefined,
        projectId: undefined,
        exchangeRate: undefined,
      },
      { subscriptionId: s.id },
    );
    const previousDue = s.nextDue;
    const nextDue = advanceDue(s.nextDue, s.frequency, s.intervalCount);
    const [updated] = await t.update(schema.subscription).set({ nextDue }).where(eq(schema.subscription.id, id)).returning();
    await recordEvent(t, ctx, {
      type: "suscripcion.pagada",
      entityType: "subscription",
      entityId: id,
      summary: `Pagó ${s.vendor}: ${formatMoney(input.amount, s.currency)} · próximo vencimiento ${nextDue.slice(8, 10)}/${nextDue.slice(5, 7)}/${nextDue.slice(0, 4)}`,
      payload: { transactionId: row.id, previousDue, nextDue },
    });
    return { transaction: row, subscription: updated, previousDue, nextDue };
  });
}

/** Deshacer "Registrar pago": manda el gasto a la papelera y vuelve la fecha atrás. */
export async function undoSubscriptionPayment(ctx: Ctx, id: string, transactionId: string, previousDue: string) {
  assertCan(ctx, "delete", "finance");
  const prev = zDate.parse(previousDue);
  return getDb().transaction(async (t) => {
    const [tx] = await t
      .select()
      .from(schema.transaction)
      .where(and(eq(schema.transaction.id, transactionId), scoped(schema.transaction, ctx), eq(schema.transaction.subscriptionId, id)));
    if (!tx) throw notFound("El pago");
    await t.update(schema.transaction).set({ deletedAt: new Date() }).where(eq(schema.transaction.id, transactionId));
    const [s] = await t
      .update(schema.subscription)
      .set({ nextDue: prev })
      .where(and(eq(schema.subscription.id, id), scoped(schema.subscription, ctx)))
      .returning();
    if (!s) throw notFound("La suscripción");
    await recordEvent(t, ctx, {
      type: "suscripcion.pago_deshecho",
      entityType: "subscription",
      entityId: id,
      summary: `Deshizo el pago de ${s.vendor}`,
    });
    return s;
  });
}

// ---------------------------------------------------------------------------
// Job diario (worker)
// ---------------------------------------------------------------------------
/** Pasa a `overdue` los cobros y pagos pendientes vencidos y emite `cobro.vencido` / `pago.vencido`. */
export async function markOverdue(today = todayAR()) {
  return getDb().transaction(async (t) => {
    const recs = await t
      .update(schema.receivable)
      .set({ status: "overdue" })
      .where(and(inArray(schema.receivable.status, ["pending", "partial"]), lt(schema.receivable.dueDate, today), isNull(schema.receivable.deletedAt)))
      .returning();
    for (const r of recs) {
      await recordEvent(t, systemCtx(r.workspaceId), {
        type: "cobro.vencido",
        entityType: "receivable",
        entityId: r.id,
        summary: `Venció el cobro «${r.concept}» (${formatMoney(subMoney(r.amount, r.paidAmount), r.currency)} pendientes)`,
      });
    }
    const pays = await t
      .update(schema.payable)
      .set({ status: "overdue" })
      .where(and(inArray(schema.payable.status, ["pending", "partial"]), lt(schema.payable.dueDate, today), isNull(schema.payable.deletedAt)))
      .returning();
    for (const p of pays) {
      await recordEvent(t, systemCtx(p.workspaceId), {
        type: "pago.vencido",
        entityType: "payable",
        entityId: p.id,
        summary: `Venció el pago a ${p.counterpart}: «${p.concept}» (${formatMoney(subMoney(p.amount, p.paidAmount), p.currency)} pendientes)`,
      });
    }
    return { receivables: recs.length, payables: pays.length };
  });
}

export const OPEN_STATUSES = OPEN;
