import { diffDays, formatDate, formatMoney, subMoney, todayAR } from "@agencyos/core";
import { cn } from "@agencyos/ui";
import type { ReactNode } from "react";

/** Piezas de presentación compartidas por Por cobrar y Por pagar (server components). */

export const DEBT_VIEWS = [
  { key: "abiertos", label: "Pendientes" },
  { key: "saldados", label: "Saldados" },
  { key: "anulados", label: "Anulados" },
  { key: "todos", label: "Todos" },
] as const;

export function ViewChips({ active, href }: { active: string; href: (view: string) => string }) {
  return (
    <nav aria-label="Estado" className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
      {DEBT_VIEWS.map((v) => (
        <a
          key={v.key}
          href={href(v.key)}
          aria-current={active === v.key ? "page" : undefined}
          className={cn(
            "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] transition-colors",
            active === v.key ? "border-success/40 bg-success-soft text-text" : "border-border bg-surface text-text-muted hover:text-text",
          )}
        >
          {v.label}
        </a>
      ))}
    </nav>
  );
}

export function dueInfo(due: string | null, status: string, today = todayAR()) {
  if (!due) return { text: "sin vencimiento", tone: "text-text-faint" };
  if (status === "paid" || status === "void") return { text: `vencía ${formatDate(due)}`, tone: "text-text-faint" };
  const d = diffDays(due, today);
  if (d < 0) return { text: `vencido hace ${-d} d`, tone: "text-danger" };
  if (d === 0) return { text: "vence hoy", tone: "text-warning" };
  if (d <= 7) return { text: `vence en ${d} d`, tone: "text-warning" };
  return { text: `vence ${formatDate(due)}`, tone: "text-text-muted" };
}

export function Remaining({ amount, paid, currency }: { amount: string; paid: string; currency: string }) {
  const rem = subMoney(amount, paid);
  return (
    <div className="text-right">
      <p className="font-mono text-[16px] tabular-nums text-text">{formatMoney(rem, currency)}</p>
      <p className="font-mono text-[11px] text-text-faint">
        {Number(paid) > 0 ? `${formatMoney(paid, currency)} de ${formatMoney(amount, currency)}` : `de ${formatMoney(amount, currency)}`}
      </p>
    </div>
  );
}

export function Payments({ children }: { children: ReactNode }) {
  return <ul className="mt-3 flex flex-col gap-1 border-t border-border pt-3">{children}</ul>;
}
