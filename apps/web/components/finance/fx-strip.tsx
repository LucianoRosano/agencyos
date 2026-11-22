import { formatDate } from "@agencyos/core";
import type { FxQuote } from "@agencyos/modules/fx/service";

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });

/** Dólar del día (oficial, MEP y blue, venta) — DolarAPI vía el worker. Sin datos todavía, no se muestra. */
export function FxStrip({ rates }: { rates: FxQuote[] }) {
  if (!rates.length) return null;
  const day = rates.reduce((a, r) => (r.day > a ? r.day : a), "");
  return (
    <section
      aria-label="Cotización del dólar"
      className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[var(--radius-card)] border border-border bg-bg-elevated px-4 py-3"
      data-testid="fx-strip"
    >
      <span className="text-[13px] text-text-muted">Dólar · venta</span>
      {rates.map((r) => (
        <span key={r.source} className="flex items-baseline gap-1.5 text-[14px]">
          <span className="text-text-muted">{r.label}</span>
          <span className="font-mono font-medium text-text">{r.sell ? ars.format(Number(r.sell)) : "—"}</span>
        </span>
      ))}
      <span className="ml-auto text-[12px] text-text-faint">{formatDate(day)} · DolarAPI</span>
    </section>
  );
}
