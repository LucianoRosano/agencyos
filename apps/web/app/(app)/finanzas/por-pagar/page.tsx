import { addMoney, formatDate, formatMoney, subMoney } from "@agencyos/core";
import { type DebtView, getPayable, listPayables } from "@agencyos/modules/finance/queries";
import { Button, Card, EmptyState } from "@agencyos/ui";
import { Receipt } from "lucide-react";
import { NewPayableButton, type PayableData, PayableMenu, PayPayableSheet } from "@/components/finance/debt-ui";
import { DEBT_VIEWS, dueInfo, Payments, Remaining, ViewChips } from "@/components/finance/debt-view";
import { FinanceHeader, NoFinanceAccess } from "@/components/finance/finance-header";
import { financePage, formOptions, qs, type SP } from "@/components/finance/server";
import { DebtStatus, MoneyLines, PaidBar } from "@/components/finance/shared";

export const metadata = { title: "Por pagar · Finanzas" };

export default async function PorPagarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = await financePage(sp);
  if (!f.allowed) return <NoFinanceAccess />;
  const view = (DEBT_VIEWS.find((v) => v.key === sp.ver)?.key ?? "abiertos") as DebtView;
  const [rows, options, deep] = await Promise.all([listPayables(f.ctx, { view, ledgerId: f.ledgerId }), formOptions(f.ctx), sp.pagar ? getPayable(f.ctx, sp.pagar) : Promise.resolve(null)]);
  const toData = (p: NonNullable<typeof deep>): PayableData => ({
    id: p.id,
    ledgerId: p.ledgerId,
    counterpart: p.counterpart,
    concept: p.concept,
    amount: p.amount,
    paidAmount: p.paidAmount,
    currency: p.currency,
    dueDate: p.dueDate,
    status: p.status,
  });
  const pending = new Map<string, string>();
  for (const { p } of rows) if (["pending", "partial", "overdue"].includes(p.status)) pending.set(p.currency, addMoney(pending.get(p.currency) ?? "0", subMoney(p.amount, p.paidAmount)));
  const totals = [...pending.entries()].map(([currency, total]) => ({
    currency,
    total,
  }));
  return (
    <div className="mx-auto max-w-5xl">
      <FinanceHeader active="por-pagar" title="Por pagar" ledgers={f.ledgers} ledgerId={f.ledgerId} actions={<NewPayableButton options={options} defaultLedgerId={f.defaultLedgerId} />} />
      {deep ? <PayPayableSheet key={deep.id} p={toData(deep)} options={options} openInitially /> : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6">
        <ViewChips active={view} href={(v) => `/finanzas/por-pagar${qs(f.ledgerId, { ver: v === "abiertos" ? undefined : v })}`} />
        {totals.length ? (
          <div className="mb-4 flex items-baseline gap-3 text-[13px] text-text-muted">
            <span>Pendiente de pago</span>
            <MoneyLines items={totals} className="flex-row gap-4 text-[15px] text-warning" />
          </div>
        ) : null}
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map(({ p, ledgerName, payments }) => {
            const due = dueInfo(p.dueDate, p.status);
            const data = toData(p);
            const open = ["pending", "partial", "overdue"].includes(p.status);
            return (
              <li key={p.id} data-payable={p.id}>
                <Card className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium text-text-muted">{p.counterpart}</span>
                        <DebtStatus status={p.status} kind="payable" />
                        {!f.ledgerId ? <span className="font-mono text-[11px] text-text-faint">{ledgerName}</span> : null}
                      </div>
                      <h3 className="mt-1.5 text-[15px] font-medium text-text">{p.concept}</h3>
                      <p className={`mt-0.5 text-[13px] ${due.tone}`}>{due.text}</p>
                    </div>
                    <div className="flex items-center justify-between gap-4 md:w-56 md:flex-col md:items-end md:gap-2">
                      <Remaining amount={p.amount} paid={p.paidAmount} currency={p.currency} />
                      <div className="w-28 md:w-full">
                        <PaidBar paid={p.paidAmount} amount={p.amount} />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      {open ? (
                        <PayPayableSheet
                          p={data}
                          options={options}
                          trigger={
                            <Button variant="secondary" className="flex-1 md:flex-none">
                              Registrar pago
                            </Button>
                          }
                        />
                      ) : null}
                      <PayableMenu p={data} options={options} />
                    </div>
                  </div>
                  {payments.length ? (
                    <Payments>
                      {payments.map((x) => (
                        <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                          <span className="font-mono tabular-nums text-text-muted">{formatDate(x.date)}</span>
                          <span className="font-mono tabular-nums text-text">− {formatMoney(x.amount, x.currency)}</span>
                          <span className="text-text-muted">{x.accountName}</span>
                        </li>
                      ))}
                    </Payments>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={<Receipt />}
            title={view === "abiertos" ? "No tenés pagos pendientes" : "No hay pagos en esta vista"}
            description="Anotá deudas y compromisos (cuotas, préstamos, proveedores) con su vencimiento. Te avisamos en Hoy y al pagar se registra el gasto."
            action={view === "abiertos" ? <NewPayableButton options={options} defaultLedgerId={f.defaultLedgerId} label="Agregar un pago" variant="primary" /> : undefined}
          />
        </Card>
      )}
    </div>
  );
}
