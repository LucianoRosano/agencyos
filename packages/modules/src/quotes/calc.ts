/**
 * Cálculo puro de presupuestos (sin base de datos ni efectos): ítems, descuentos, totales,
 * plan de cobro y comparación de versiones. Todo el dinero en strings con los helpers de
 * @agencyos/core (BigInt en centavos); nunca float.
 */
import { addDays, addMonths, fromCents, mulMoney, percentOf, splitByPercents, toCents } from "@agencyos/core";
import type { PaymentPlan } from "@agencyos/db/schema";

export type { PaymentPlan };
export const DISCOUNT_TYPES = ["none", "percent", "amount"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export type CalcItemInput = { quantity: string; unitPrice: string; discountType: DiscountType | string; discountValue: string };
export type CalcLine = { gross: string; discount: string; lineTotal: string };
export type CalcIssue = { path: string; message: string };
export type QuoteTotals = {
  lines: CalcLine[];
  /** Suma de cantidad × precio unitario, antes de cualquier descuento. */
  subtotal: string;
  /** Suma de los descuentos por ítem. */
  itemsDiscount: string;
  /** Subtotal menos descuentos por ítem (base del descuento global). */
  netItems: string;
  globalDiscount: string;
  /** Descuentos por ítem + global. */
  discountTotal: string;
  /** subtotal − discountTotal. */
  total: string;
  issues: CalcIssue[];
};

const ZERO = "0.00";
const cents = (v: string | number) => toCents(v);
const sum = (vals: string[]) => fromCents(vals.reduce((a, v) => a + cents(v), 0n));

/** Importe del descuento sobre una base: % (redondeado al centavo, half-up) o monto fijo. */
export function discountAmount(base: string, type: string, value: string | null | undefined): string {
  const v = value && value.trim() !== "" ? value : "0";
  if (type === "percent") return percentOf(base, v);
  if (type === "amount") return fromCents(cents(v));
  return ZERO;
}

export function calcLine(it: CalcItemInput): CalcLine {
  const gross = mulMoney(it.unitPrice, it.quantity);
  const discount = discountAmount(gross, it.discountType, it.discountValue);
  return { gross, discount, lineTotal: fromCents(cents(gross) - cents(discount)) };
}

/** Totales del presupuesto + problemas de validación (descuentos que superan su base, precios negativos…). */
export function calcQuote(input: { items: CalcItemInput[]; globalDiscountType: DiscountType | string; globalDiscountValue: string | null | undefined }): QuoteTotals {
  const issues: CalcIssue[] = [];
  if (!input.items.length) issues.push({ path: "items", message: "Agregá al menos un ítem" });
  const lines = input.items.map((it, i) => {
    if (cents(it.unitPrice) < 0n) issues.push({ path: `items.${i}.unitPrice`, message: "El precio no puede ser negativo" });
    if (cents(it.quantity) <= 0n) issues.push({ path: `items.${i}.quantity`, message: "La cantidad debe ser mayor a cero" });
    const line = calcLine(it);
    if (it.discountType === "percent" && cents(it.discountValue || "0") > 10000n) issues.push({ path: `items.${i}.discountValue`, message: "El descuento no puede superar el 100 %" });
    else if (cents(line.discount) < 0n) issues.push({ path: `items.${i}.discountValue`, message: "El descuento no puede ser negativo" });
    else if (cents(line.discount) > cents(line.gross)) issues.push({ path: `items.${i}.discountValue`, message: "El descuento supera el importe del ítem" });
    return line;
  });
  const subtotal = sum(lines.map((l) => l.gross));
  const itemsDiscount = sum(lines.map((l) => l.discount));
  const netItems = fromCents(cents(subtotal) - cents(itemsDiscount));
  const globalDiscount = discountAmount(netItems, input.globalDiscountType, input.globalDiscountValue);
  if (input.globalDiscountType === "percent" && cents(input.globalDiscountValue || "0") > 10000n) issues.push({ path: "globalDiscountValue", message: "El descuento no puede superar el 100 %" });
  else if (cents(globalDiscount) < 0n) issues.push({ path: "globalDiscountValue", message: "El descuento no puede ser negativo" });
  else if (cents(globalDiscount) > 0n && cents(globalDiscount) > cents(netItems)) issues.push({ path: "globalDiscountValue", message: "El descuento global supera el subtotal" });
  const discountTotal = fromCents(cents(itemsDiscount) + cents(globalDiscount));
  const total = fromCents(cents(subtotal) - cents(discountTotal));
  return { lines, subtotal, itemsDiscount, netItems, globalDiscount, discountTotal, total, issues };
}

// --- Plan de cobro ---

export type ScheduleRow = { label: string; percent: number | null; amount: string; dueDate: string; offsetDays: number };

/** Cantidad de cuotas que se generan para un abono indefinido (los primeros 12 meses). */
export const MONTHLY_INDEFINITE_HORIZON = 12;

export function planIssues(plan: PaymentPlan): CalcIssue[] {
  const out: CalcIssue[] = [];
  if (plan.kind === "milestones") {
    if (!plan.items.length) out.push({ path: "paymentPlan.items", message: "Agregá al menos una etapa" });
    plan.items.forEach((m, i) => {
      if (!(m.percent > 0)) out.push({ path: `paymentPlan.items.${i}.percent`, message: "El porcentaje debe ser mayor a cero" });
    });
    const total = plan.items.reduce((a, m) => a + Math.round(m.percent * 100), 0);
    if (plan.items.length && total !== 10000) out.push({ path: "paymentPlan.items", message: `Los porcentajes deben sumar 100 (suman ${total / 100})` });
  }
  if (plan.kind === "monthly") {
    if (cents(plan.amount || "0") <= 0n) out.push({ path: "paymentPlan.amount", message: "El monto mensual debe ser mayor a cero" });
    if (plan.months !== null && !(plan.months >= 1)) out.push({ path: "paymentPlan.months", message: "Indicá la cantidad de meses o dejalo indefinido" });
  }
  return out;
}

/**
 * Cuotas del plan a partir de una fecha (la de aceptación):
 * único → 1; etapas → una por etapa (la última absorbe el redondeo); mensual → N meses (12 si es indefinido).
 */
export function paymentSchedule(plan: PaymentPlan, total: string, start: string): ScheduleRow[] {
  if (plan.kind === "milestones") {
    const parts = splitByPercents(total, plan.items.map((m) => m.percent));
    return plan.items.map((m, i) => ({ label: m.label, percent: m.percent, amount: parts[i] ?? ZERO, dueDate: addDays(start, m.offsetDays ?? 0), offsetDays: m.offsetDays ?? 0 }));
  }
  if (plan.kind === "monthly") {
    const n = plan.months ?? MONTHLY_INDEFINITE_HORIZON;
    return Array.from({ length: n }, (_, i) => ({
      label: plan.months ? `Abono mensual ${i + 1}/${plan.months}` : `Abono mensual · mes ${i + 1}`,
      percent: null,
      amount: fromCents(cents(plan.amount)),
      dueDate: addMonths(start, i),
      offsetDays: 0,
    }));
  }
  return [{ label: "Pago único", percent: 100, amount: fromCents(cents(total)), dueDate: start, offsetDays: 0 }];
}

/** Presets de etapas que ofrece el editor. */
export const MILESTONE_PRESETS: Record<string, { label: string; percent: number; offsetDays?: number }[]> = {
  "50/50": [
    { label: "Anticipo", percent: 50, offsetDays: 0 },
    { label: "Saldo a la entrega", percent: 50, offsetDays: 30 },
  ],
  "40/30/30": [
    { label: "Anticipo", percent: 40, offsetDays: 0 },
    { label: "Avance", percent: 30, offsetDays: 15 },
    { label: "Saldo a la entrega", percent: 30, offsetDays: 30 },
  ],
};

// --- Comparación de versiones ---

export type DiffableItem = { description: string; quantity: string; unitPrice: string; discountType: string; discountValue: string; lineTotal: string };
export type DiffableVersion = { items: DiffableItem[]; subtotal: string; discountTotal: string; total: string; currency: string };
export type ItemDiff =
  | { kind: "added"; after: DiffableItem }
  | { kind: "removed"; before: DiffableItem }
  | { kind: "changed"; before: DiffableItem; after: DiffableItem; changes: ("quantity" | "unitPrice" | "discount" | "lineTotal")[] }
  | { kind: "same"; before: DiffableItem; after: DiffableItem };
export type TotalDiff = { field: "subtotal" | "discountTotal" | "total"; before: string; after: string; delta: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const eqMoney = (a: string, b: string) => cents(a) === cents(b);

/** Diff de ítems (emparejados por descripción) y de totales entre dos versiones. */
export function diffVersions(a: DiffableVersion, b: DiffableVersion): { items: ItemDiff[]; totals: TotalDiff[]; currencyChanged: boolean } {
  const pool = [...b.items];
  const items: ItemDiff[] = [];
  for (const before of a.items) {
    const idx = pool.findIndex((x) => norm(x.description) === norm(before.description));
    if (idx === -1) {
      items.push({ kind: "removed", before });
      continue;
    }
    const after = pool.splice(idx, 1)[0] as DiffableItem;
    const changes: ("quantity" | "unitPrice" | "discount" | "lineTotal")[] = [];
    if (!eqMoney(before.quantity, after.quantity)) changes.push("quantity");
    if (!eqMoney(before.unitPrice, after.unitPrice)) changes.push("unitPrice");
    if (before.discountType !== after.discountType || !eqMoney(before.discountValue, after.discountValue)) changes.push("discount");
    if (!eqMoney(before.lineTotal, after.lineTotal)) changes.push("lineTotal");
    items.push(changes.length ? { kind: "changed", before, after, changes } : { kind: "same", before, after });
  }
  for (const after of pool) items.push({ kind: "added", after });
  const totals = (["subtotal", "discountTotal", "total"] as const).map((field) => ({ field, before: a[field], after: b[field], delta: fromCents(cents(b[field]) - cents(a[field])) }));
  return { items, totals, currencyChanged: a.currency !== b.currency };
}
