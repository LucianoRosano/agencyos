import { formatDate, formatMoney } from "@agencyos/core";
import { listCustomers } from "@agencyos/modules/shop/service";
import { Badge, Card, cn, EmptyState, PageHeader } from "@agencyos/ui";
import { Users } from "lucide-react";
import Link from "next/link";
import { NewCustomerSheet } from "@/components/shop/shop-ui";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sc = await requireShopCtx();
  const sp = await searchParams;
  const q = sp.q;
  const onlyDebt = sp.deuda === "1";
  const all = await listCustomers(sc, q);
  const rows = onlyDebt ? all.filter((r) => Number(r.owed) > 0) : all;
  return (
    <>
      <PageHeader title="Clientes" description="Quién te compra, cuánto y cuándo fue la última vez." accent="#4F7A52" actions={<NewCustomerSheet />} />
      <form className="mb-4 flex flex-wrap gap-2" role="search" action="/comercio/clientes">
        <label htmlFor="cust-q" className="sr-only">
          Buscar clientes
        </label>
        <input
          id="cust-q"
          name="q"
          defaultValue={q}
          placeholder="Nombre o teléfono"
          className="h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base text-text md:text-sm"
        />
        <Link
          href={onlyDebt ? "/comercio/clientes" : "/comercio/clientes?deuda=1"}
          aria-current={onlyDebt ? "true" : undefined}
          className={cn(
            "inline-flex h-11 items-center rounded-full border px-4 text-[14px]",
            onlyDebt ? "border-accent bg-accent-soft" : "border-border text-text-muted",
          )}
        >
          Con deuda
        </Link>
      </form>
      {rows.length ? (
        <Card className="px-4">
          <ul className="divide-y divide-border" data-testid="customer-list">
            {rows.map(({ c, spent, purchases, lastPurchase, owed }) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <span className="min-w-0 flex-1">
                  <Link href={`/comercio/clientes/${c.id}`} className="block truncate text-[15px] underline-offset-2 hover:underline">
                    {c.name}
                  </Link>
                  <span className="block truncate text-[12px] text-text-muted">
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "Sin contacto"}
                    {lastPurchase ? ` · última compra ${formatDate(lastPurchase)}` : ""}
                  </span>
                </span>
                {Number(owed) > 0 ? <Badge tone="warning">Debe {formatMoney(owed, sc.currency)}</Badge> : null}
                <span className="text-[13px] text-text-muted">{purchases} compras</span>
                <span className="w-28 text-right font-mono">{formatMoney(spent, sc.currency)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-2">
          <EmptyState
            icon={<Users />}
            title={q || onlyDebt ? (onlyDebt && !q ? "Nadie debe nada" : "Sin resultados") : "Todavía no hay clientes"}
            description={q ? undefined : "Cargalos con «Nuevo cliente» y asignalos al vender."}
          />
        </Card>
      )}
    </>
  );
}
