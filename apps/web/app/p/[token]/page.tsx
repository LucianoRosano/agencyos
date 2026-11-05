import { formatDate, formatMoney } from "@agencyos/core";
import { openPublicQuote } from "@agencyos/modules/quotes/public";
import { geistFontCss } from "@agencyos/pdf/fonts";
import { renderQuoteHtml } from "@agencyos/pdf/quote-html";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import { DecisionForm } from "./decision-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Presupuesto · Luciano Rosano", robots: { index: false, follow: false } };

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await openPublicQuote(token);
  if (!data) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold">El enlace venció o no es válido</h1>
          <p className="mt-2 text-sm text-text-muted">Pedile a Luciano Rosano un enlace nuevo.</p>
        </div>
      </main>
    );
  }
  const { quote, doc, decision } = data;
  const html = renderQuoteHtml(doc, { fontCss: geistFontCss(), preview: true });
  const open = ["sent", "viewed"].includes(quote.status) && !decision;
  return (
    <main className="min-h-dvh bg-bg px-4 py-6 md:py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-[10px] border border-border-strong font-semibold">LR</span>
            <div>
              <p className="text-[15px] font-medium">Luciano Rosano</p>
              <p className="font-mono text-[12px] text-text-muted">
                Presupuesto {quote.number} · válido hasta {formatDate(doc.validUntil)}
              </p>
            </div>
          </div>
          <a
            href={`/p/${token}/pdf`}
            className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-border bg-surface px-4 text-sm hover:bg-surface-2"
          >
            <Download className="size-4" /> Descargar PDF
          </a>
        </header>
        <iframe title={`Presupuesto ${quote.number}`} srcDoc={html} sandbox="" className="h-[70dvh] w-full rounded-[12px] border border-border bg-white" />
        <section className="rounded-[12px] border border-border bg-surface p-5">
          <p className="text-[13px] text-text-muted">Total</p>
          <p className="font-mono text-[26px]">{formatMoney(doc.calc.total, doc.currency)}</p>
          {decision ? (
            <p className="mt-3 text-[15px]">
              {decision.decision === "accepted" ? "✓ Aceptado" : "Rechazado"} por <strong>{decision.signerName}</strong> el {formatDate(decision.at)}. ¡Gracias!
            </p>
          ) : open ? (
            <DecisionForm token={token} />
          ) : (
            <p className="mt-3 text-[14px] text-text-muted">Este presupuesto ya no admite respuestas en línea. Escribile a Luciano.</p>
          )}
        </section>
      </div>
    </main>
  );
}
