import { formatDate, formatDateTime, formatMoney } from "@agencyos/core";
import { listSales, PAYMENT_LABEL } from "@agencyos/modules/shop/service";
import { Badge, Button, Card, EmptyState, PageHeader } from "@agencyos/ui";
import { Receipt } from "lucide-react";
import Link from "next/link";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Ventas" };

export default async function SalesPage() {
  const sc = await requireShopCtx();
  const sales = await listSales(sc);
  return (
    <>
      <PageHeader
        title="Ventas"
        accent="#4F7A52"
        actions={
          <Button asChild variant="primary">
            <Link href="/comercio/vender">Nueva venta</Link>
          </Button>
        }
      />
      {sales.length ? (
        <Card className="px-4">
          <ul className="divide-y divide-border" data-testid="sales-list">
            {sales.map(({ s, customer, items }) => (
              <li key={s.id}>
                <Link href={`/comercio/ventas/${s.id}`} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:opacity-90">
                  <span className="font-mono text-[13px] text-text-muted">n.º {s.number}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">
                    {customer ?? "Consumidor final"} · {items} u. · {PAYMENT_LABEL[s.paymentMethod as keyof typeof PAYMENT_LABEL]}
                  </span>
                  <span className="font-mono text-[12px] text-text-muted" title={formatDateTime(s.soldAt)}>
                    {formatDate(s.day)}
                  </span>
                  {s.status === "cancelled" ? <Badge tone="danger">Anulada</Badge> : null}
                  <span className="w-28 text-right font-mono text-[15px]">{formatMoney(s.total, sc.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-2">
          <EmptyState
            icon={<Receipt />}
            title="Todavía no hay ventas"
            action={
              <Link href="/comercio/vender" className="text-[14px] text-accent-text underline">
                Hacer la primera
              </Link>
            }
          />
        </Card>
      )}
    </>
  );
}
