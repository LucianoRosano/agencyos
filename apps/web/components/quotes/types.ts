/** Tipos del editor de presupuestos (seguros para el cliente). */

export type ItemDraft = {
  key: string;
  serviceId: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountType: "none" | "percent" | "amount";
  discountValue: string;
};

export type MilestoneDraft = { key: string; label: string; percent: string; offsetDays: string };

export type PlanDraft = { kind: "single" | "milestones" | "monthly"; items: MilestoneDraft[]; amount: string; months: string };

export type QuoteDraft = {
  clientId: string;
  contactId: string;
  opportunityId: string;
  title: string;
  currency: "ARS" | "USD";
  exchangeRateRef: string;
  issueDate: string;
  validUntil: string;
  introMd: string;
  scopeMd: string;
  exclusionsMd: string;
  termsMd: string;
  notesMd: string;
  items: ItemDraft[];
  globalDiscountType: "none" | "percent" | "amount";
  globalDiscountValue: string;
  plan: PlanDraft;
};

export type EditorOptions = {
  clients: { id: string; name: string }[];
  contacts: { id: string; name: string; clientIds: string[] }[];
  opportunities: { id: string; title: string; clientId: string; stage: string }[];
  services: { id: string; name: string; unit: string; priceArs: string | null; priceUsd: string | null; descriptionMd: string | null }[];
};

export type PreviewTotals = { lines: string[]; subtotal: string; itemsDiscount: string; globalDiscount: string; total: string };
export type PreviewState = { html: string; totals: PreviewTotals; issues: { path: string; message: string }[] };

/** Borrador → payload del servicio (el plan según su tipo). */
export function draftToPayload(d: QuoteDraft) {
  const { plan, items, ...rest } = d;
  const paymentPlan =
    plan.kind === "milestones"
      ? { kind: "milestones", items: plan.items.map((m) => ({ label: m.label, percent: m.percent.replace(",", "."), offsetDays: m.offsetDays })) }
      : plan.kind === "monthly"
        ? { kind: "monthly", amount: plan.amount, months: plan.months }
        : { kind: "single" };
  return { ...rest, items: items.map(({ key: _k, ...it }) => it), paymentPlan };
}
