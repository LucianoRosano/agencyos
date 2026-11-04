import { formatMoney, L, label } from "@agencyos/core";
import { Badge, cn } from "@agencyos/ui";

/** Piezas de presentación de Finanzas sin estado (usables desde server y client components). */

export const FIN_ACCENT = "#34D399";

export type Opt = { value: string; label: string };
export type AccountOpt = {
  id: string;
  name: string;
  currency: string;
  ledgerId: string;
  ledgerName?: string | null;
};
export type CategoryOpt = {
  id: string;
  label: string;
  kind: string;
  depth: number;
};
export type FormOptions = {
  accounts: AccountOpt[];
  categories: CategoryOpt[];
  clients: Opt[];
  projects: Opt[];
  ledgers: Opt[];
};

export const opts = (m: Record<string, string>) => Object.entries(m).map(([value, l]) => ({ value, label: l }));
export const CURRENCIES: Opt[] = [
  { value: "ARS", label: "ARS · pesos" },
  { value: "USD", label: "USD · dólares" },
];

/** Monto con signo y color según el tipo de movimiento. Siempre acompañado de signo (no solo color). */
export function Amount({ value, currency, kind, className }: { value: string; currency: string; kind?: string; className?: string }) {
  const sign = kind === "income" || kind === "transfer_in" ? "+" : kind === "expense" || kind === "transfer_out" ? "−" : "";
  const tone = kind === "income" ? "text-success" : kind?.startsWith("transfer") ? "text-text-muted" : "text-text";
  return (
    <span className={cn("font-mono tabular-nums whitespace-nowrap", tone, className)}>
      {sign}
      {sign ? " " : ""}
      {formatMoney(value, currency)}
    </span>
  );
}

/** Lista de montos por moneda (nunca se suman monedas distintas). */
export function MoneyLines({
  items,
  empty = "—",
  className,
  emptyClassName,
  tone,
}: { items: { currency: string; total: string }[]; empty?: string; className?: string; emptyClassName?: string; tone?: string }) {
  if (!items.length) return <span className={cn("block font-mono text-text-faint", emptyClassName ?? className)}>{empty}</span>;
  return (
    <span className={cn("flex flex-col gap-0.5", className)}>
      {items.map((i) => (
        <span key={i.currency} className={cn("font-mono tabular-nums", tone, Number(i.total) < 0 && "text-danger")}>
          {formatMoney(i.total, i.currency)}
        </span>
      ))}
    </span>
  );
}

const STATUS_TONE: Record<string, "neutral" | "accent" | "info" | "success" | "warning" | "danger"> = {
  pending: "neutral",
  partial: "info",
  paid: "success",
  overdue: "danger",
  void: "neutral",
  active: "success",
  paused: "warning",
  cancelled: "neutral",
};

export function DebtStatus({ status, kind }: { status: string; kind: "receivable" | "payable" }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{label(kind === "receivable" ? L.receivableStatus : L.payableStatus, status)}</Badge>;
}

export function SubStatus({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{label(L.subscriptionStatus, status)}</Badge>;
}

export function frequencyLabel(frequency: string, interval: number) {
  if (interval <= 1) return label(L.frequency, frequency);
  const unit = frequency === "weekly" ? "semanas" : frequency === "yearly" ? "años" : "meses";
  return `Cada ${interval} ${unit}`;
}

/** Barra de progreso de un cobro/pago parcial. */
export function PaidBar({ paid, amount }: { paid: string; amount: string }) {
  const pct = Math.max(0, Math.min(100, (Number(paid) / Math.max(Number(amount), 0.01)) * 100));
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Cobrado">
      <span className="block h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
    </span>
  );
}
