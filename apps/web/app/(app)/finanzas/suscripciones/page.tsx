import { diffDays, formatDate, formatMoney, todayAR } from "@agencyos/core";
import { getSubscription, listSubscriptions, subscriptionMonthlyCost } from "@agencyos/modules/finance/queries";
import { Button, Card, cn, EmptyState, SectionLabel } from "@agencyos/ui";
import { Repeat } from "lucide-react";
import { FinanceHeader, NoFinanceAccess } from "@/components/finance/finance-header";
import { financePage, formOptions, type SP } from "@/components/finance/server";
import { frequencyLabel, SubStatus } from "@/components/finance/shared";
import { NewSubscriptionButton, PaySubscriptionSheet, type SubData, SubscriptionMenu } from "@/components/finance/subscription-ui";

export const metadata = { title: "Suscripciones · Finanzas" };

function dueText(due: string, today: string) {
  const d = diffDays(due, today);
  if (d < 0) return { text: `vencida hace ${-d} d`, tone: "text-danger" };
  if (d === 0) return { text: "vence hoy", tone: "text-warning" };
  if (d <= 7) return { text: `vence en ${d} d`, tone: "text-warning" };
  return { text: `vence el ${formatDate(due)}`, tone: "text-text-muted" };
}

export default async function SuscripcionesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = await financePage(sp);
  if (!f.allowed) return <NoFinanceAccess />;
  const [rows, cost, options, deep] = await Promise.all([
    listSubscriptions(f.ctx, { ledgerId: f.ledgerId }),
    subscriptionMonthlyCost(f.ctx, { ledgerId: f.ledgerId }),
    formOptions(f.ctx),
    sp.pagar ? getSubscription(f.ctx, sp.pagar) : Promise.resolve(null),
  ]);
  const today = todayAR();
  const toData = (s: (typeof rows)[number]["s"]): SubData => ({
    id: s.id,
    ledgerId: s.ledgerId,
    vendor: s.vendor,
    description: s.description,
    amount: s.amount,
    currency: s.currency,
    frequency: s.frequency,
    intervalCount: s.intervalCount,
    nextDue: s.nextDue,
    accountId: s.accountId,
    categoryId: s.categoryId,
    notifyDaysBefore: s.notifyDaysBefore,
    status: s.status,
  });
  return (
    <div className="mx-auto max-w-6xl">
      <FinanceHeader
        active="suscripciones"
        title="Suscripciones y gastos fijos"
        ledgers={f.ledgers}
        ledgerId={f.ledgerId}
        actions={<NewSubscriptionButton options={options} defaultLedgerId={f.defaultLedgerId} />}
      />
      {deep ? <PaySubscriptionSheet key={deep.id} sub={toData(deep)} accounts={options.accounts} openInitially /> : null}

      {rows.length ? (
        <>
          <Card className="mb-5 flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <div>
              <SectionLabel icon={<Repeat />}>Cuánto me cuestan por mes</SectionLabel>
              <p className="mt-1.5 text-[13px] text-text-muted">
                {cost.count} activa{cost.count === 1 ? "" : "s"}, normalizado a mensual (anual ÷ 12, semanal × 52 ÷ 12). Cada moneda por separado.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {cost.byCurrency.length ? (
                cost.byCurrency.map((c) => (
                  <div key={c.currency} className="md:text-right">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">{c.currency} / mes</p>
                    <p className="font-mono text-[26px] font-semibold tabular-nums text-text">{formatMoney(c.total, c.currency)}</p>
                  </div>
                ))
              ) : (
                <p className="text-[13px] text-text-muted">Sin suscripciones activas.</p>
              )}
            </div>
          </Card>
          <ul className="flex flex-col gap-2">
            {rows.map(({ s, monthly, accountName, categoryName, ledgerName, lastPaid }) => {
              const due = dueText(s.nextDue, today);
              const data = toData(s);
              return (
                <li key={s.id} data-sub={s.id} data-vendor={s.vendor}>
                  <Card className={cn("flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-5", s.status !== "active" && "opacity-70")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-[15px] font-medium text-text">{s.vendor}</h3>
                        {s.status !== "active" ? <SubStatus status={s.status} /> : null}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-text-muted">
                        {[s.description, categoryName, accountName ?? "sin cuenta asignada", !f.ledgerId ? ledgerName : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:flex md:items-center md:gap-6">
                      <div>
                        <p className="font-mono text-[15px] tabular-nums text-text">{formatMoney(s.amount, s.currency)}</p>
                        <p className="text-[12px] text-text-muted">
                          {frequencyLabel(s.frequency, s.intervalCount)}
                          {s.frequency !== "monthly" || s.intervalCount > 1 ? ` · ${formatMoney(monthly, s.currency)}/mes` : ""}
                        </p>
                      </div>
                      <div className="text-right md:w-40 md:text-left">
                        <p className={cn("text-[13px]", s.status === "active" ? due.tone : "text-text-muted")}>
                          {s.status === "active" ? due.text : `próx. ${formatDate(s.nextDue)}`}
                        </p>
                        <p className="font-mono text-[11px] text-text-faint">{lastPaid ? `último pago ${formatDate(lastPaid)}` : "sin pagos registrados"}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      {s.status !== "cancelled" ? (
                        <PaySubscriptionSheet
                          sub={data}
                          accounts={options.accounts}
                          trigger={
                            <Button variant="secondary" className="flex-1 md:flex-none">
                              Registrar pago
                            </Button>
                          }
                        />
                      ) : null}
                      <SubscriptionMenu sub={data} options={options} />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <Card>
          <EmptyState
            icon={<Repeat />}
            title="Sin suscripciones ni gastos fijos"
            description="Cargá lo que pagás todos los meses o años (hosting, dominios, IA, herramientas). Te avisamos antes del vencimiento en Hoy y con un toque registrás el pago."
            action={<NewSubscriptionButton options={options} defaultLedgerId={f.defaultLedgerId} label="Agregar la primera" variant="primary" />}
          />
        </Card>
      )}
    </div>
  );
}
