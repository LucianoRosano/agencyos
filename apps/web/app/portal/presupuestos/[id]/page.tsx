import { formatDate, formatMoney } from "@agencyos/core";
import { portalQuote } from "@agencyos/modules/portal/service";
import { geistFontCss } from "@agencyos/pdf/fonts";
import { renderQuoteHtml } from "@agencyos/pdf/quote-html";
import { Card, PageHeader } from "@agencyos/ui";
import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalCtx } from "@/lib/session";
import { QuoteDecisionForm } from "../../portal-ui";

export const metadata = { title: "Presupuesto" };
export const dynamic = "force-dynamic";

export default async function PortalQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pc = await requirePortalCtx();
  if (!pc.clientId) notFound();
  const data = await portalQuote(pc, id);
  if (!data) notFound();
  const { quote, doc, decision } = data;
  const html = renderQuoteHtml(doc, { fontCss: geistFontCss(), preview: true });
  const open = ["sent", "viewed"].includes(quote.status) && !decision;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={
          <Link href="/portal/presupuestos" className="hover:text-text">
            ← Presupuestos
          </Link>
        }
        title={quote.title}
        description={`${quote.number} · válido hasta ${formatDate(doc.validUntil)}`}
        accent="#22D3EE"
        actions={
          <a
            href={`/portal/presupuestos/${quote.id}/pdf`}
            className="inline-flex h-11 items-center gap-2 rounded-[8px] border border-border bg-surface px-4 text-sm hover:bg-surface-2"
          >
            <Download className="size-4" /> Descargar PDF
          </a>
        }
      />
      <iframe title={`Presupuesto ${quote.number}`} srcDoc={html} sandbox="" className="h-[70dvh] w-full rounded-[12px] border border-border bg-white" />
      <Card className="p-5">
        <p className="text-[13px] text-text-muted">Total</p>
        <p className="font-mono text-[26px]">{formatMoney(doc.calc.total, doc.currency)}</p>
        {decision ? (
          <p className="mt-3 text-[15px]">
            {decision.decision === "accepted" ? "✓ Aceptado" : "Rechazado"} por <strong>{decision.signerName}</strong> el {formatDate(decision.at)}.
          </p>
        ) : open ? (
          <QuoteDecisionForm quoteId={quote.id} defaultName={pc.user.name} />
        ) : (
          <p className="mt-3 text-[14px] text-text-muted">Este presupuesto ya no admite respuestas en línea. Escribile a Luciano.</p>
        )}
      </Card>
    </div>
  );
}
