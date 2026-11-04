import { editorOptions, newQuoteDefaults, previewDocument } from "@agencyos/modules/quotes/queries";
import { Button, EmptyState, PageHeader } from "@agencyos/ui";
import { BriefcaseBusiness } from "lucide-react";
import Link from "next/link";
import { QuoteEditor } from "@/components/quotes/quote-editor";
import { draftToPayload, type QuoteDraft } from "@/components/quotes/types";
import { requireCtx } from "@/lib/session";
import { previewState } from "../lib";

export const metadata = { title: "Nuevo presupuesto" };

let k = 0;

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const opts = await editorOptions(ctx);
  const opp = sp.oportunidad ? opts.opportunities.find((o) => o.id === sp.oportunidad) : undefined;
  const clientId = opp?.clientId ?? (opts.clients.some((c) => c.id === sp.cliente) ? sp.cliente : undefined);
  const base = newQuoteDefaults(opts.template, { clientId, opportunityId: opp?.id, title: opp?.title, currency: ctx.workspace.defaultCurrency });
  const initial: QuoteDraft = {
    ...base,
    currency: base.currency === "USD" ? "USD" : "ARS",
    items: (base.items.length ? base.items : [{ serviceId: "", description: "", quantity: "1", unit: "", unitPrice: "", discountType: "none", discountValue: "" }]).map((it) => ({
      ...it,
      key: `n${++k}`,
      discountType: "none" as const,
    })),
    globalDiscountType: "none",
    plan: { kind: "single", items: [], amount: "", months: "" },
  };
  const doc = await previewDocument(ctx, draftToPayload(initial));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Presupuestos · nuevo" title="Nuevo presupuesto" description="Editor a la izquierda, vista previa del PDF a la derecha. Los totales los calcula el servidor." accent="#A78BFA" />
      {opts.clients.length ? (
        <QuoteEditor initial={initial} options={opts} initialPreview={previewState(doc)} />
      ) : (
        <EmptyState
          icon={<BriefcaseBusiness />}
          title="Primero cargá un cliente"
          description="Todo presupuesto es para un cliente. Cargalo en el CRM (o desde una oportunidad) y volvé: el editor lo va a tener en la lista."
          action={
            <Button asChild variant="primary">
              <Link href="/crm/clientes">Ir a clientes</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
