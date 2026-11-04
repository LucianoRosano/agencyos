import "server-only";
import type { schema } from "@agencyos/db";
import type { QuoteDocData } from "@agencyos/modules/quotes/queries";
import { geistFontCssFromUrl } from "@agencyos/pdf/fonts";
import { renderQuoteHtml } from "@agencyos/pdf/quote-html";
import type { PreviewState, QuoteDraft } from "@/components/quotes/types";

const FONT_URL = "/presupuestos/fuente";

/** HTML de la vista previa (mismo que el PDF, con la fuente servida por URL). */
export function previewHtml(doc: QuoteDocData) {
  return renderQuoteHtml(doc, { fontCss: geistFontCssFromUrl(FONT_URL), preview: true });
}

export function previewState(doc: QuoteDocData): PreviewState {
  return {
    html: previewHtml(doc),
    totals: { lines: doc.calc.lines.map((l) => l.lineTotal), subtotal: doc.calc.subtotal, itemsDiscount: doc.calc.itemsDiscount, globalDiscount: doc.calc.globalDiscount, total: doc.calc.total },
    issues: doc.calc.issues,
  };
}

let k = 0;
const key = () => `s${++k}`;
/** Montos guardados ("1500.00") → texto editable ("1500"). */
const plain = (v: string | null | undefined) => (v ? v.replace(/\.00$/, "") : "");

type Version = typeof schema.quoteVersion.$inferSelect;
type Item = typeof schema.quoteItem.$inferSelect;
type Quote = typeof schema.quote.$inferSelect;

export function draftFromVersion(q: Quote, v: Version, items: Item[]): QuoteDraft {
  const plan = v.paymentPlan;
  return {
    clientId: q.clientId,
    contactId: q.contactId ?? "",
    opportunityId: q.opportunityId ?? "",
    title: q.title,
    currency: v.currency === "USD" ? "USD" : "ARS",
    exchangeRateRef: v.exchangeRateRef ? v.exchangeRateRef.replace(/\.?0+$/, "") : "",
    issueDate: v.issueDate,
    validUntil: v.validUntil,
    introMd: v.introMd ?? "",
    scopeMd: v.scopeMd ?? "",
    exclusionsMd: v.exclusionsMd ?? "",
    termsMd: v.termsMd ?? "",
    notesMd: v.notesMd ?? "",
    items: items.map((it) => ({
      key: key(),
      serviceId: it.serviceId ?? "",
      description: it.description,
      quantity: plain(it.quantity),
      unit: it.unit ?? "",
      unitPrice: plain(it.unitPrice),
      discountType: (["percent", "amount"].includes(it.discountType) ? it.discountType : "none") as "none",
      discountValue: it.discountType === "none" ? "" : plain(it.discountValue),
    })),
    globalDiscountType: (["percent", "amount"].includes(v.globalDiscountType) ? v.globalDiscountType : "none") as "none",
    globalDiscountValue: v.globalDiscountType === "none" ? "" : plain(v.globalDiscountValue),
    plan: {
      kind: plan.kind,
      items: plan.kind === "milestones" ? plan.items.map((m) => ({ key: key(), label: m.label, percent: String(m.percent), offsetDays: m.offsetDays !== undefined ? String(m.offsetDays) : "" })) : [],
      amount: plan.kind === "monthly" ? plain(plan.amount) : "",
      months: plan.kind === "monthly" && plan.months ? String(plan.months) : "",
    },
  };
}
