import { formatDate, formatMoney } from "@agencyos/core";
import { CHANNEL_LABEL, listOrders, ORDER_LABEL } from "@agencyos/modules/shop/service";
import { Badge, Button, Card, EmptyState, PageHeader, SectionLabel } from "@agencyos/ui";
import { ClipboardList, FileText } from "lucide-react";
import Link from "next/link";
import { Pos } from "@/components/shop/pos";
import { OrderActions } from "@/components/shop/shop-ui";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Pedidos" };

const TONE: Record<string, "info" | "warning" | "success" | "neutral" | "danger"> = {
  new: "info",
  preparing: "warning",
  ready: "success",
  delivered: "neutral",
  cancelled: "danger",
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sc = await requireShopCtx();
  const sp = await searchParams;
  const orders = await listOrders(sc);
  const open = orders.filter((o) => ["new", "preparing", "ready"].includes(o.o.status));
  const closed = orders.filter((o) => !["new", "preparing", "ready"].includes(o.o.status)).slice(0, 30);
  return (
    <>
      <PageHeader title="Pedidos" description="Pedidos por WhatsApp, teléfono o redes: se cobran y descuentan stock al entregarlos." accent="#4F7A52" />
      {sp.nuevo === "1" ? (
        <section className="mb-8" aria-label="Nuevo pedido">
          <SectionLabel className="mb-3">Nuevo pedido</SectionLabel>
          <Pos mode="order" currency={sc.currency} canDiscount={false} />
        </section>
      ) : (
        <Button asChild variant="primary" className="mb-5">
          <Link href="/comercio/pedidos?nuevo=1">Nuevo pedido</Link>
        </Button>
      )}
      <SectionLabel className="mb-3">Para hacer ({open.length})</SectionLabel>
      {open.length ? (
        <ul className="mb-8 flex flex-col gap-2" data-testid="open-orders">
          {open.map(({ o, customer, phone, items }) => (
            <li key={o.id}>
              <Card className="flex flex-col gap-2 p-4">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] text-text-muted">n.º {o.number}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{customer ?? "Sin cliente"}</span>
                  <Badge tone={TONE[o.status] ?? "neutral"}>{ORDER_LABEL[o.status as keyof typeof ORDER_LABEL]}</Badge>
                </span>
                <span className="text-[14px] text-text-muted">{items}</span>
                <span className="flex flex-wrap items-center gap-x-3 text-[13px] text-text-muted">
                  {CHANNEL_LABEL[o.channel as keyof typeof CHANNEL_LABEL]}
                  {o.deliveryDate ? ` · para el ${formatDate(o.deliveryDate)}` : ""}
                  {phone ? (
                    <a href={`https://wa.me/${phone.replace(/\D/g, "").replace(/^(?!54)/, "54")}`} className="text-accent-text underline">
                      WhatsApp
                    </a>
                  ) : null}
                  <span className="ml-auto font-mono text-[15px] text-text">{formatMoney(o.total, sc.currency)}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <OrderActions id={o.id} status={o.status} />
                  <RemitoLinks id={o.id} number={o.number} />
                </span>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="mb-8 p-2">
          <EmptyState compact icon={<ClipboardList />} title="Sin pedidos pendientes" />
        </Card>
      )}
      {closed.length ? (
        <>
          <SectionLabel className="mb-3">Cerrados</SectionLabel>
          <Card className="px-4">
            <ul className="divide-y divide-border">
              {closed.map(({ o, customer }) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 py-3 text-[14px]">
                  <span className="font-mono text-text-muted">n.º {o.number}</span>
                  <span className="min-w-0 flex-1 truncate">{customer ?? "Sin cliente"}</span>
                  <Badge tone={TONE[o.status] ?? "neutral"}>{ORDER_LABEL[o.status as keyof typeof ORDER_LABEL]}</Badge>
                  <span className="font-mono">{formatMoney(o.total, sc.currency)}</span>
                  <RemitoLinks id={o.id} number={o.number} />
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </>
  );
}

/** Remito del pedido en PDF, sin precios (para quien recibe) o valorizado. */
function RemitoLinks({ id, number }: { id: string; number: number }) {
  return (
    <span className="flex items-center gap-1">
      <Button asChild size="sm" variant="ghost" className="h-10">
        <a href={`/comercio/pedidos/${id}/remito`} target="_blank" rel="noopener" aria-label={`Remito del pedido ${number}`}>
          <FileText className="size-4" aria-hidden />
          Remito
        </a>
      </Button>
      <Button asChild size="sm" variant="ghost" className="h-10">
        <a href={`/comercio/pedidos/${id}/remito?precios=1`} target="_blank" rel="noopener" aria-label={`Remito con precios del pedido ${number}`}>
          Con precios
        </a>
      </Button>
    </span>
  );
}
