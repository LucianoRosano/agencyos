import { addMoney, formatDate, formatMoney, subMoney } from "@agencyos/core";
import { type DebtView, getReceivable, listReceivables } from "@agencyos/modules/finance/queries";
import { Button, Card, EmptyState, EntityChip } from "@agencyos/ui";
import { FileText, HandCoins } from "lucide-react";
import Link from "next/link";
import { CollectSheet, NewReceivableButton, type ReceivableData, ReceivableMenu } from "@/components/finance/debt-ui";
import { DEBT_VIEWS, dueInfo, Payments, Remaining, ViewChips } from "@/components/finance/debt-view";
import { FinanceHeader, NoFinanceAccess } from "@/components/finance/finance-header";
import { financePage, formOptions, qs, type SP } from "@/components/finance/server";
import { DebtStatus, MoneyLines, PaidBar } from "@/components/finance/shared";

export const metadata = { title: "Por cobrar · Finanzas" };

export default async function PorCobrarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = await financePage(sp);
  if (!f.allowed) return <NoFinanceAccess />;
  const view = (DEBT_VIEWS.find((v) => v.key === sp.ver)?.key ?? "abiertos") as DebtView;
  const [rows, options, deep] = await Promise.all([
    f.showReceivables ? listReceivables(f.ctx, { view }) : Promise.resolve([]),
    formOptions(f.ctx),
    sp.cobrar ? getReceivable(f.ctx, sp.cobrar) : Promise.resolve(null),
  ]);
  const toData = (r: (typeof rows)[number]["r"], clientName: string | null): ReceivableData => ({
    id: r.id,
    clientId: r.clientId,
    projectId: r.projectId,
    concept: r.concept,
    amount: r.amount,
    paidAmount: r.paidAmount,
    currency: r.currency,
    dueDate: r.dueDate,
    status: r.status,
    clientName,
  });
  const pending = new Map<string, string>();
  for (const { r } of rows)
    if (["pending", "partial", "overdue"].includes(r.status))
      pending.set(r.currency, addMoney(pending.get(r.currency) ?? "0", subMoney(r.amount, r.paidAmount)));
  const totals = [...pending.entries()].map(([currency, total]) => ({
    currency,
    total,
  }));
  return (
    <div className="mx-auto max-w-5xl">
      <FinanceHeader
        active="por-cobrar"
        title="Por cobrar"
        ledgers={f.ledgers}
        ledgerId={f.ledgerId}
        actions={f.showReceivables ? <NewReceivableButton options={options} /> : null}
      />
      {deep ? <CollectSheet key={deep.r.id} r={toData(deep.r, deep.clientName)} options={options} openInitially /> : null}
      {!f.showReceivables ? (
        <Card>
          <EmptyState
            icon={<HandCoins />}
            title="Los cobros a clientes son del libro Agencia"
            description="Este libro es personal. Cambiá a Agencia o a la vista combinada para ver lo que te deben."
            action={
              <Button asChild>
                <Link href="/finanzas/por-cobrar">Ver vista combinada</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-x-6">
            <ViewChips active={view} href={(v) => `/finanzas/por-cobrar${qs(f.ledgerId, { ver: v === "abiertos" ? undefined : v })}`} />
            {totals.length ? (
              <div className="mb-4 flex items-baseline gap-3 text-[13px] text-text-muted">
                <span>Pendiente de cobro</span>
                <MoneyLines items={totals} className="flex-row gap-4 text-[15px] text-success" />
              </div>
            ) : null}
          </div>
          {rows.length ? (
            <ul className="flex flex-col gap-2">
              {rows.map(({ r, clientName, projectName, payments }) => {
                const due = dueInfo(r.dueDate, r.status);
                const data = toData(r, clientName);
                const open = ["pending", "partial", "overdue"].includes(r.status);
                return (
                  <li key={r.id} data-receivable={r.id}>
                    <Card className="p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <EntityChip color="#22D3EE">{clientName ?? "Cliente"}</EntityChip>
                            {projectName ? <EntityChip color="#7C5CFF">{projectName}</EntityChip> : null}
                            <DebtStatus status={r.status} kind="receivable" />
                          </div>
                          <h3 className="mt-2 text-[15px] font-medium text-text">{r.concept}</h3>
                          <p className={`mt-0.5 text-[13px] ${due.tone}`}>{due.text}</p>
                        </div>
                        <div className="flex items-center justify-between gap-4 md:w-56 md:flex-col md:items-end md:gap-2">
                          <Remaining amount={r.amount} paid={r.paidAmount} currency={r.currency} />
                          <div className="w-28 md:w-full">
                            <PaidBar paid={r.paidAmount} amount={r.amount} />
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          {open ? (
                            <CollectSheet
                              r={data}
                              options={options}
                              trigger={
                                <Button variant="secondary" className="flex-1 md:flex-none">
                                  Registrar cobro
                                </Button>
                              }
                            />
                          ) : null}
                          <ReceivableMenu r={data} options={options} />
                        </div>
                      </div>
                      {payments.length ? (
                        <Payments>
                          {payments.map((p) => (
                            <li key={p.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                              <span className="font-mono tabular-nums text-text-muted">{formatDate(p.date)}</span>
                              <span className="font-mono tabular-nums text-success">+ {formatMoney(p.amount, p.currency)}</span>
                              <span className="text-text-muted">{p.accountName}</span>
                              <span className="font-mono text-[12px] text-text-faint">{p.description?.match(/C-\d{4}-\d{4,}/)?.[0]}</span>
                              <Button asChild variant="ghost" size="sm" className="ml-auto">
                                <a href={`/finanzas/constancia/${p.id}`} target="_blank" rel="noopener">
                                  <FileText className="size-4" /> Constancia
                                </a>
                              </Button>
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
                icon={<HandCoins />}
                title={view === "abiertos" ? "Nadie te debe nada" : "No hay cobros en esta vista"}
                description="Los cobros llegan solos cuando un presupuesto se acepta, o los cargás a mano: cliente, concepto, monto y vencimiento. Al cobrar se registra el ingreso y podés emitir la constancia."
                action={view === "abiertos" ? <NewReceivableButton options={options} label="Agregar un cobro" variant="primary" /> : undefined}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
