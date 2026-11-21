import { formatDate, formatMoney } from "@agencyos/core";
import { listCustomers } from "@agencyos/modules/shop/service";
import { Card, EmptyState, PageHeader } from "@agencyos/ui";
import { Users } from "lucide-react";
import { NewCustomerSheet } from "@/components/shop/shop-ui";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sc = await requireShopCtx();
  const q = (await searchParams).q;
  const rows = await listCustomers(sc, q);
  return (
    <>
      <PageHeader title="Clientes" description="Quién te compra, cuánto y cuándo fue la última vez." accent="#34D399" actions={<NewCustomerSheet />} />
      <form className="mb-4" role="search" action="/comercio/clientes">
        <label htmlFor="cust-q" className="sr-only">
          Buscar clientes
        </label>
        <input
          id="cust-q"
          name="q"
          defaultValue={q}
          placeholder="Nombre o teléfono"
          className="h-11 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base text-text md:text-sm"
        />
      </form>
      {rows.length ? (
        <Card className="px-4">
          <ul className="divide-y divide-border" data-testid="customer-list">
            {rows.map(({ c, spent, purchases, lastPurchase }) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{c.name}</span>
                  <span className="block truncate text-[12px] text-text-muted">
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "Sin contacto"}
                    {lastPurchase ? ` · última compra ${formatDate(lastPurchase)}` : ""}
                  </span>
                </span>
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
            title={q ? "Sin resultados" : "Todavía no hay clientes"}
            description={q ? undefined : "Cargalos con «Nuevo cliente» y asignalos al vender."}
          />
        </Card>
      )}
    </>
  );
}
