import { formatDate, formatMoney, todayAR } from "@agencyos/core";
import { getReceipt } from "@agencyos/modules/finance/queries";
import { Button, Card, EmptyState } from "@agencyos/ui";
import { ArrowLeft, FileX } from "lucide-react";
import Link from "next/link";
import { NoFinanceAccess } from "@/components/finance/finance-header";
import { PrintButton } from "@/components/finance/print-button";
import { financePage } from "@/components/finance/server";

export const metadata = { title: "Constancia de pago" };

/** Estilos de impresión: A4, blanco y negro, solo la hoja (sin la interfaz). */
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 18mm; }
  html, body { background: #fff !important; }
  body aside, body header, body nav, body [data-sonner-toaster], .no-print { display: none !important; }
  body * { visibility: hidden !important; }
  .constancia, .constancia * { visibility: visible !important; color: #000 !important; border-color: #000 !important; background: transparent !important; box-shadow: none !important; }
  .constancia { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; min-height: 0 !important; }
}`;

export default async function ConstanciaPage({ params }: { params: Promise<{ transactionId: string }> }) {
  const { transactionId } = await params;
  const f = await financePage({});
  if (!f.allowed) return <NoFinanceAccess />;
  const data = /^[0-9a-f-]{36}$/.test(transactionId) ? await getReceipt(f.ctx, transactionId) : null;
  if (!data) {
    return (
      <Card className="mx-auto max-w-xl">
        <EmptyState
          icon={<FileX />}
          title="No hay constancia para este movimiento"
          description="Las constancias se emiten para cobros registrados desde «Por cobrar»."
          action={
            <Button asChild>
              <Link href="/finanzas/por-cobrar">Ir a Por cobrar</Link>
            </Button>
          }
        />
      </Card>
    );
  }
  const { tx, receivable, client, settings, number } = data;
  const issuer = {
    name: settings.agencyName?.trim() || "Luciano Rosano",
    email: settings.agencyEmail?.trim() || "lucianorosanott@gmail.com",
    phone: settings.agencyPhone?.trim() || "11 5526-0021",
    web: settings.agencyWebsite?.trim(),
    city: settings.agencyCity?.trim(),
  };
  return (
    <div className="mx-auto max-w-[210mm]">
      <style>{PRINT_CSS}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost">
          <Link href="/finanzas/por-cobrar">
            <ArrowLeft className="size-4" /> Por cobrar
          </Link>
        </Button>
        <PrintButton />
      </div>
      <article className="constancia rounded-[4px] border border-black/10 bg-white p-6 text-[#111] shadow-[0_10px_40px_-10px_rgba(0,0,0,.5)] md:min-h-[297mm] md:p-[18mm]">
        <div className="flex flex-col gap-6 border-b-2 border-black pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[22px] font-semibold tracking-tight">{issuer.name}</p>
            <p className="mt-1 text-[13px] leading-relaxed">
              {issuer.email}
              <br />
              WhatsApp {issuer.phone}
              {issuer.web ? (
                <>
                  <br />
                  {issuer.web}
                </>
              ) : null}
              {issuer.city ? (
                <>
                  <br />
                  {issuer.city}
                </>
              ) : null}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="font-mono text-[12px] uppercase tracking-[0.2em]">Constancia de pago</p>
            <p className="mt-1 font-mono text-[20px] font-semibold">{number}</p>
            <p className="mt-1 text-[13px]">Fecha: {formatDate(tx.date)}</p>
          </div>
        </div>

        <p className="mt-6 border-2 border-black px-4 py-2.5 text-center font-mono text-[13px] font-semibold uppercase tracking-[0.18em]">
          Documento no válido como factura
        </p>

        <dl className="mt-8 grid gap-x-6 gap-y-5 text-[14px] sm:grid-cols-[160px_1fr]">
          <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/70">Recibí de</dt>
          <dd className="text-[16px] font-medium">{client?.name ?? tx.clientName ?? "—"}</dd>
          <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/70">Concepto</dt>
          <dd>
            {receivable?.concept ?? tx.description}
            {tx.projectName ? <span className="block text-[13px]">Proyecto: {tx.projectName}</span> : null}
          </dd>
          <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/70">Fecha de pago</dt>
          <dd>{formatDate(tx.date)}</dd>
          <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/70">Medio</dt>
          <dd>{tx.accountName ?? "—"}</dd>
          <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-black/70">Importe recibido</dt>
          <dd className="font-mono text-[26px] font-semibold tabular-nums">{formatMoney(tx.amount, tx.currency, { decimals: true })}</dd>
        </dl>

        <div className="mt-16 border-t border-black/30 pt-4 text-[12px] leading-relaxed">
          <p>Constancia interna de pago emitida por {issuer.name}. Documento no válido como factura.</p>
          <p className="mt-1 font-mono text-[11px]">
            Emitida el {formatDate(todayAR())} · {number}
          </p>
        </div>
      </article>
    </div>
  );
}
