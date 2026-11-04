import { L } from "@agencyos/core";
import { listTransactions, type TxFilters, transactionTotals } from "@agencyos/modules/finance/queries";
import { Button, EmptyState } from "@agencyos/ui";
import { ArrowLeftRight, Download, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { FinanceHeader, NoFinanceAccess } from "@/components/finance/finance-header";
import { financePage, formOptions, qs, type SP } from "@/components/finance/server";
import { MoneyLines } from "@/components/finance/shared";
import { TransactionSheet } from "@/components/finance/tx-form";
import { TransactionList } from "@/components/finance/tx-list";

export const metadata = { title: "Movimientos · Finanzas" };

const KIND_OPTS = [
  { value: "", label: "Todos los tipos" },
  { value: "income", label: L.txKind.income },
  { value: "expense", label: L.txKind.expense },
  { value: "transfer", label: "Transferencia" },
];
const ctl = "h-10 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base text-text md:text-sm";

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = await financePage(sp);
  if (!f.allowed) return <NoFinanceAccess />;
  const filters: TxFilters = {
    ledgerId: f.ledgerId,
    accountId: sp.cuenta || undefined,
    categoryId: sp.categoria || undefined,
    kind: (["income", "expense", "transfer"] as const).find((k) => k === sp.tipo),
    from: /^\d{4}-\d{2}-\d{2}$/.test(sp.desde ?? "") ? sp.desde : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta ?? "") ? sp.hasta : undefined,
    q: sp.q || undefined,
  };
  const [page, totals, options] = await Promise.all([listTransactions(f.ctx, { ...filters, cursor: sp.cursor }), transactionTotals(f.ctx, filters), formOptions(f.ctx)]);
  const accounts = options.accounts.filter((a) => !f.ledgerId || a.ledgerId === f.ledgerId);
  const filtered = Boolean(filters.accountId || filters.categoryId || filters.kind || filters.from || filters.to || filters.q);
  const keep = {
    cuenta: sp.cuenta,
    categoria: sp.categoria,
    tipo: sp.tipo,
    desde: sp.desde,
    hasta: sp.hasta,
    q: sp.q,
  };
  const csvHref = `/finanzas/reportes/csv${qs(f.ledgerId, { tipo: "movimientos", desde: filters.from, hasta: filters.to, cuenta: filters.accountId, categoria: filters.categoryId, clase: filters.kind, q: filters.q })}`;
  return (
    <div className="mx-auto max-w-6xl">
      <FinanceHeader active="movimientos" title="Movimientos" ledgers={f.ledgers} ledgerId={f.ledgerId} extraQuery={keep} />
      <TransactionSheet key={sp.nuevo === "1" ? "nuevo" : "cerrado"} options={options} openInitially={sp.nuevo === "1"} defaultAccountId={filters.accountId ?? accounts[0]?.id} />

      <details className="group mb-5 rounded-[var(--radius-card)] border border-border bg-surface md:open:bg-surface" open={filtered || undefined}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-[14px] text-text-muted marker:hidden">
          <SlidersHorizontal className="size-4" /> Filtros
          {filtered ? <span className="font-mono text-[11px] text-accent-2">activos</span> : null}
        </summary>
        <form action="/finanzas/movimientos" className="grid grid-cols-1 gap-3 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-6">
          {f.ledgerId ? <input type="hidden" name="libro" value={f.ledgerId} /> : null}
          <input name="q" defaultValue={sp.q} placeholder="Buscar…" aria-label="Buscar movimientos" className={`${ctl} lg:col-span-2`} />
          <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo" className={`${ctl} select-chevron appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9`}>
            {KIND_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select name="cuenta" defaultValue={sp.cuenta ?? ""} aria-label="Cuenta" className={`${ctl} select-chevron appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9`}>
            <option value="">Todas las cuentas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
          <select name="categoria" defaultValue={sp.categoria ?? ""} aria-label="Categoría" className={`${ctl} select-chevron appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9`}>
            <option value="">Todas las categorías</option>
            <optgroup label="Ingresos">
              {options.categories
                .filter((c) => c.kind === "income")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Gastos">
              {options.categories
                .filter((c) => c.kind === "expense")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </optgroup>
          </select>
          <div className="grid grid-cols-2 gap-3 lg:col-span-1 lg:grid-cols-1">
            <input type="date" name="desde" defaultValue={sp.desde} aria-label="Desde" className={ctl} />
            <input type="date" name="hasta" defaultValue={sp.hasta} aria-label="Hasta" className={ctl} />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-6 lg:justify-end">
            {filtered ? (
              <Button asChild variant="ghost">
                <Link href={`/finanzas/movimientos${qs(f.ledgerId)}`}>Limpiar</Link>
              </Button>
            ) : null}
            <Button type="submit" variant="secondary">
              Aplicar filtros
            </Button>
          </div>
        </form>
      </details>

      {page.items.length ? (
        <>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
              <div>
                <dt className="text-text-muted">Ingresos{filtered ? " (filtro)" : ""}</dt>
                <dd>
                  <MoneyLines items={totals.income} tone="text-success" />
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Gastos{filtered ? " (filtro)" : ""}</dt>
                <dd>
                  <MoneyLines items={totals.expense} />
                </dd>
              </div>
            </dl>
            <Button asChild variant="ghost" size="sm">
              <a href={csvHref}>
                <Download className="size-4" /> CSV
              </a>
            </Button>
          </div>
          <TransactionList items={page.items} options={options} showLedger={!f.ledgerId} />
          <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Paginación">
            {sp.cursor ? (
              <Button asChild variant="ghost">
                <Link href={`/finanzas/movimientos${qs(f.ledgerId, keep)}`}>← Más recientes</Link>
              </Button>
            ) : (
              <span />
            )}
            {page.nextCursor ? (
              <Button asChild variant="secondary">
                <Link href={`/finanzas/movimientos${qs(f.ledgerId, { ...keep, cursor: page.nextCursor })}`}>Más antiguos →</Link>
              </Button>
            ) : null}
          </nav>
        </>
      ) : (
        <EmptyState
          icon={<ArrowLeftRight />}
          title={filtered ? "No hay movimientos con estos filtros" : "Todavía no hay movimientos"}
          description={
            filtered
              ? "Probá con otro rango de fechas o limpiá los filtros."
              : options.accounts.length
                ? "Registrá ingresos, gastos y transferencias entre tus cuentas. Los saldos se calculan solos."
                : "Primero creá tus cuentas (efectivo, banco, Mercado Pago, dólares) con su saldo inicial."
          }
          action={
            filtered ? (
              <Button asChild>
                <Link href={`/finanzas/movimientos${qs(f.ledgerId)}`}>Limpiar filtros</Link>
              </Button>
            ) : options.accounts.length ? (
              <Button asChild variant="primary">
                <Link href={`/finanzas/movimientos${qs(f.ledgerId, { nuevo: "1" })}`}>Registrar movimiento</Link>
              </Button>
            ) : (
              <Button asChild variant="primary">
                <Link href="/finanzas/cuentas?nueva=1">Crear cuenta</Link>
              </Button>
            )
          }
        />
      )}
    </div>
  );
}
