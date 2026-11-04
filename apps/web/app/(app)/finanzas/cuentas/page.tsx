import { addMoney, formatDate, formatMoney, L, label } from "@agencyos/core";
import { listAccounts, listCategories } from "@agencyos/modules/finance/queries";
import { BlockCard, Card, EmptyState } from "@agencyos/ui";
import { Landmark, Tags } from "lucide-react";
import Link from "next/link";
import { AccountMenu, NewAccountButton } from "@/components/finance/account-ui";
import { CategoryManager } from "@/components/finance/category-ui";
import { FinanceHeader, NoFinanceAccess } from "@/components/finance/finance-header";
import { financePage, qs, type SP } from "@/components/finance/server";
import { MoneyLines } from "@/components/finance/shared";

export const metadata = { title: "Cuentas · Finanzas" };

export default async function CuentasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = await financePage(sp);
  if (!f.allowed) return <NoFinanceAccess />;
  const [accounts, categories] = await Promise.all([listAccounts(f.ctx, { ledgerId: f.ledgerId }), listCategories(f.ctx)]);
  const ledgerOpts = f.ledgers.map((l) => ({ value: l.id, label: l.name }));
  const totals = new Map<string, { currency: string; total: string }[]>();
  for (const a of accounts) {
    const key = a.ledgerName ?? "";
    const list = totals.get(key) ?? [];
    const cur = list.find((x) => x.currency === a.currency);
    if (cur) cur.total = addMoney(cur.total, a.balance);
    else list.push({ currency: a.currency, total: a.balance });
    totals.set(key, list);
  }
  const groups = [...new Set(accounts.map((a) => a.ledgerName ?? ""))];
  return (
    <div className="mx-auto max-w-6xl">
      <FinanceHeader
        active="cuentas"
        title="Cuentas"
        ledgers={f.ledgers}
        ledgerId={f.ledgerId}
        actions={<NewAccountButton ledgers={ledgerOpts} defaultLedgerId={f.defaultLedgerId} openInitially={sp.nueva === "1"} variant="secondary" />}
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex flex-col gap-5" aria-label="Cuentas">
          {accounts.length ? (
            groups.map((g) => (
              <Card key={g} className="p-4 md:p-5">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-text-muted">Libro {g}</h2>
                  <MoneyLines items={totals.get(g) ?? []} className="items-end text-[13px] text-text-muted" />
                </div>
                <ul className="divide-y divide-border">
                  {accounts
                    .filter((a) => (a.ledgerName ?? "") === g)
                    .map((a) => (
                      <li key={a.id} className="flex items-center gap-3 py-3" data-account={a.name}>
                        <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-border bg-surface-2 font-mono text-[11px] text-text-muted">{a.currency}</span>
                        <div className="min-w-0 flex-1">
                          <Link href={`/finanzas/movimientos${qs(undefined, { cuenta: a.id })}`} className="block truncate text-[15px] text-text hover:underline">
                            {a.name}
                          </Link>
                          <p className="truncate text-[12px] text-text-muted">
                            {label(L.accountKind, a.kind)} · inicial {formatMoney(a.openingBalance, a.currency)} al {formatDate(a.openingDate)} · {a.movements} mov.
                          </p>
                        </div>
                        <span className={`font-mono text-[15px] tabular-nums ${Number(a.balance) < 0 ? "text-danger" : "text-text"}`}>{formatMoney(a.balance, a.currency)}</span>
                        <AccountMenu
                          ledgers={ledgerOpts}
                          account={{
                            id: a.id,
                            name: a.name,
                            ledgerId: a.ledgerId,
                            kind: a.kind,
                            currency: a.currency,
                            openingBalance: a.openingBalance,
                            openingDate: a.openingDate,
                            movements: a.movements,
                          }}
                        />
                      </li>
                    ))}
                </ul>
              </Card>
            ))
          ) : (
            <Card>
              <EmptyState
                icon={<Landmark />}
                title="Todavía no cargaste cuentas"
                description="Creá cada lugar donde tenés plata (efectivo, banco, Mercado Pago, dólares) con su saldo inicial. Desde ahí, cada ingreso, gasto o transferencia actualiza el saldo."
                action={<NewAccountButton ledgers={ledgerOpts} defaultLedgerId={f.defaultLedgerId} label="Crear la primera cuenta" />}
              />
            </Card>
          )}
        </section>
        <BlockCard icon={<Tags />} title="Categorías" className="self-start">
          <CategoryManager
            categories={categories.map((c) => ({
              id: c.id,
              name: c.name,
              kind: c.kind,
              parentId: c.parentId,
              depth: c.depth,
            }))}
          />
        </BlockCard>
      </div>
    </div>
  );
}
