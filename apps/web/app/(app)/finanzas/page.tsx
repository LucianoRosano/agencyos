import { diffDays, dowShort, formatMoney, L, label, monthName } from "@agencyos/core";
import { financeOverview } from "@agencyos/modules/finance/queries";
import { BarPairs, BlockCard, Button, Card, cn, EmptyState, SectionLabel } from "@agencyos/ui";
import { ArrowRight, CalendarClock, ChartColumn, HandCoins, Landmark, Repeat, Wallet } from "lucide-react";
import Link from "next/link";
import { FinanceHeader, NoFinanceAccess } from "@/components/finance/finance-header";
import { financePage, qs, type SP } from "@/components/finance/server";
import { MoneyLines } from "@/components/finance/shared";

export const metadata = { title: "Finanzas" };

const KIND_COLOR = {
  subscription: "#34D399",
  payable: "#FBBF24",
  receivable: "#22D3EE",
} as const;
const KIND_LABEL = {
  subscription: "Suscripción",
  payable: "Pago",
  receivable: "Cobro",
} as const;

function Stat({ title, children, hint }: { title: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-2 p-4 md:p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">{title}</p>
      <div className="text-[20px] font-semibold md:text-[24px]">{children}</div>
      {hint ? <p className="text-[12px] text-text-faint">{hint}</p> : null}
    </Card>
  );
}

export default async function FinanzasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = await financePage(sp);
  if (!f.allowed) return <NoFinanceAccess />;
  const o = await financeOverview(f.ctx, {
    ledgerId: f.ledgerId,
    includeReceivables: f.showReceivables,
  });
  const mes = monthName(Number(o.month.slice(5, 7)));
  const empty = !o.accounts.length && !o.upcoming.length && !o.receivable.length && !o.payable.length && !o.chart.length && !o.monthlyCost.count;
  const L_ = (path: string, extra: Record<string, string | undefined> = {}) => `${path}${qs(f.ledgerId, extra)}`;
  return (
    <div className="mx-auto max-w-6xl">
      <FinanceHeader active="resumen" title="Resumen" ledgers={f.ledgers} ledgerId={f.ledgerId} />
      {empty ? (
        <Card>
          <EmptyState
            icon={<Wallet />}
            title="Tus finanzas arrancan vacías"
            description="Cargá tus cuentas con su saldo inicial (efectivo, banco, Mercado Pago, dólares) y tus suscripciones. Desde ahí, este resumen muestra saldos, el mes y lo que vence."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild variant="primary">
                  <Link href="/finanzas/cuentas?nueva=1">
                    <Landmark className="size-4" /> Crear cuenta
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/finanzas/suscripciones">
                    <Repeat className="size-4" /> Cargar suscripciones
                  </Link>
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4 md:gap-5">
          <section aria-label={`Este mes: ${mes}`} className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <Stat title={`Ingresos · ${mes}`}>
              <MoneyLines items={o.income} className="text-success" empty="$ 0" />
            </Stat>
            <Stat title={`Gastos · ${mes}`}>
              <MoneyLines items={o.expense} empty="$ 0" />
            </Stat>
            <Stat title="Resultado del mes" hint="Ingresos − gastos, por moneda">
              <MoneyLines items={o.result} empty="$ 0" />
            </Stat>
            <Stat title="Herramientas / mes" hint={`${o.monthlyCost.count} suscripción${o.monthlyCost.count === 1 ? "" : "es"} activa${o.monthlyCost.count === 1 ? "" : "s"}`}>
              <MoneyLines items={o.monthlyCost.byCurrency} empty="—" />
            </Stat>
          </section>

          <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-3">
            <BlockCard
              icon={<Landmark />}
              title="Saldos por cuenta"
              className="lg:col-span-2"
              action={
                <Link href={L_("/finanzas/cuentas")} className="inline-flex min-h-11 items-center gap-1 text-[13px] text-text-muted hover:text-text md:min-h-0">
                  cuentas <ArrowRight className="size-3.5" />
                </Link>
              }
            >
              {o.accounts.length ? (
                <>
                  <ul className="divide-y divide-border">
                    {o.accounts.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 py-2.5">
                        <span className="grid size-9 shrink-0 place-items-center rounded-[9px] border border-border bg-surface-2 font-mono text-[10px] text-text-muted">{a.currency}</span>
                        <div className="min-w-0 flex-1">
                          <Link href={L_("/finanzas/movimientos", { cuenta: a.id })} className="block truncate text-[14px] text-text hover:underline">
                            {a.name}
                          </Link>
                          <p className="truncate text-[12px] text-text-faint">
                            {label(L.accountKind, a.kind)}
                            {f.ledgerId ? "" : ` · ${a.ledgerName}`}
                          </p>
                        </div>
                        <span className={cn("font-mono text-[15px] tabular-nums", Number(a.balance) < 0 ? "text-danger" : "text-text")}>{formatMoney(a.balance, a.currency)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border pt-3">
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">Total</span>
                    <MoneyLines items={o.balances} className="items-end text-[15px] font-semibold text-text" />
                  </div>
                </>
              ) : (
                <EmptyState
                  compact
                  icon={<Landmark />}
                  title="Sin cuentas en este libro"
                  action={
                    <Button asChild size="sm">
                      <Link href="/finanzas/cuentas?nueva=1">Crear cuenta</Link>
                    </Button>
                  }
                />
              )}
            </BlockCard>

            <BlockCard icon={<CalendarClock />} title="Próximos 30 días" action={o.upcoming.length ? <span className="font-mono text-[12px] text-text-faint">{o.upcoming.length}</span> : undefined}>
              {o.upcoming.length ? (
                <ul className="flex flex-col">
                  {o.upcoming.slice(0, 10).map((u) => {
                    const d = diffDays(u.date, o.today);
                    return (
                      <li key={u.key}>
                        <Link href={u.href} className="-mx-2 flex min-h-12 items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2">
                          <span className={cn("w-12 shrink-0 font-mono text-[11px] uppercase leading-tight", u.overdue ? "text-danger" : d === 0 ? "text-warning" : "text-text-muted")}>
                            {u.overdue ? "vencido" : d === 0 ? "hoy" : `${dowShort(u.date)} ${Number(u.date.slice(8, 10))}`}
                          </span>
                          <span aria-hidden className="h-8 w-0.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[u.kind] }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] text-text">{u.title}</span>
                            <span className="block text-[12px] text-text-faint">{KIND_LABEL[u.kind]}</span>
                          </span>
                          <span className="font-mono text-[13px] tabular-nums text-text-muted">{formatMoney(u.amount, u.currency)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState compact icon={<CalendarClock />} title="Nada vence en los próximos 30 días" />
              )}
            </BlockCard>
          </div>

          <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-3">
            <BlockCard icon={<ChartColumn />} title="Ingresos y gastos · 6 meses" className="lg:col-span-2">
              {o.chart.length ? (
                <div className="flex flex-col gap-6">
                  {o.chart.map((c) => (
                    <div key={c.currency}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <SectionLabel className="text-[11px]">{c.currency}</SectionLabel>
                        <span className="flex items-center gap-3 text-[12px] text-text-muted">
                          <span className="flex items-center gap-1.5">
                            <span aria-hidden className="size-2 rounded-sm bg-success" /> Ingresos
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span aria-hidden className="size-2 rounded-sm bg-accent" /> Gastos
                          </span>
                        </span>
                      </div>
                      <BarPairs
                        data={c.months.map((m) => ({
                          label: m.label,
                          a: Number(m.income),
                          b: Number(m.expense),
                        }))}
                        className="[&_svg]:mx-auto [&_svg]:max-h-44"
                      />
                      <details className="mt-2 text-[12px] text-text-muted">
                        <summary className="cursor-pointer select-none py-1">Ver datos</summary>
                        <table className="mt-2 w-full font-mono tabular-nums">
                          <thead>
                            <tr className="text-left text-text-faint">
                              <th className="py-1 font-normal">Mes</th>
                              <th className="py-1 text-right font-normal">Ingresos</th>
                              <th className="py-1 text-right font-normal">Gastos</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.months.map((m) => (
                              <tr key={m.key} className="border-t border-border">
                                <td className="py-1">{m.label}</td>
                                <td className="py-1 text-right">{formatMoney(m.income, c.currency)}</td>
                                <td className="py-1 text-right">{formatMoney(m.expense, c.currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState compact icon={<ChartColumn />} title="Sin movimientos en los últimos 6 meses" description="Cuando registres ingresos y gastos, acá ves la evolución por moneda." />
              )}
            </BlockCard>

            <BlockCard icon={<HandCoins />} title="Por cobrar y por pagar">
              <div className="flex flex-col gap-4">
                {f.showReceivables ? (
                  <Link href={L_("/finanzas/por-cobrar")} className="-mx-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                    <p className="text-[13px] text-text-muted">
                      Te deben
                      {o.receivable.length ? ` · ${o.receivable.reduce((a, r) => a + r.n, 0)} cobro(s)` : ""}
                    </p>
                    <MoneyLines items={o.receivable} className="text-[20px] font-semibold text-success" empty="Nada pendiente" emptyClassName="text-[14px] font-sans" />
                  </Link>
                ) : null}
                <Link href={L_("/finanzas/por-pagar")} className="-mx-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                  <p className="text-[13px] text-text-muted">
                    Debés
                    {o.payable.length ? ` · ${o.payable.reduce((a, r) => a + r.n, 0)} pago(s)` : ""}
                  </p>
                  <MoneyLines items={o.payable} className="text-[20px] font-semibold text-warning" empty="Nada pendiente" emptyClassName="text-[14px] font-sans" />
                </Link>
                <p className="text-[12px] text-text-faint">Montos en ARS y USD por separado: nunca se convierten con cotizaciones inventadas.</p>
              </div>
            </BlockCard>
          </div>
        </div>
      )}
    </div>
  );
}
