import { formatDateTime, formatMoney } from "@agencyos/core";
import { getSale, PAYMENT_LABEL } from "@agencyos/modules/shop/service";
import { Badge, Button, Card, PageHeader } from "@agencyos/ui";
import { FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelSaleButton } from "@/components/shop/shop-ui";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Venta" };

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const sc = await requireShopCtx();
  const v = await getSale(sc, (await params).id);
  if (!v) notFound();
  const cur = sc.currency;
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/comercio/ventas" className="hover:text-text">
            Ventas
          </Link>
        }
        title={`Venta n.º ${v.s.number}`}
        description={`${formatDateTime(v.s.soldAt)} · ${v.customer ?? "Consumidor final"} · ${PAYMENT_LABEL[v.s.paymentMethod as keyof typeof PAYMENT_LABEL]}`}
        accent="#4F7A52"
        actions={
          <>
            <Button asChild variant="secondary">
              <a href={`/comercio/ventas/${v.s.id}/comprobante`} target="_blank" rel="noopener">
                <FileText className="size-4" aria-hidden />
                Comprobante
              </a>
            </Button>
            {v.s.status === "completed" && sc.role !== "seller" ? (
              <CancelSaleButton id={v.s.id} number={v.s.number} />
            ) : v.s.status === "cancelled" ? (
              <Badge tone="danger">Anulada</Badge>
            ) : null}
          </>
        }
      />
      <Card className="p-5">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="text-left font-mono text-[11px] uppercase tracking-[0.04em] text-text-muted">
              <th className="pb-2 font-normal">Producto</th>
              <th className="pb-2 text-right font-normal">Cant.</th>
              <th className="hidden pb-2 text-right font-normal sm:table-cell">Precio</th>
              <th className="pb-2 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {v.items.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="py-2">{i.name}</td>
                <td className="py-2 text-right font-mono">{i.qty}</td>
                <td className="hidden py-2 text-right font-mono sm:table-cell">{formatMoney(i.unitPrice, cur)}</td>
                <td className="py-2 text-right font-mono">{formatMoney(i.lineTotal, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1 border-t border-border pt-3 text-[14px]">
          <dt className="text-text-muted">Subtotal</dt>
          <dd className="text-right font-mono">{formatMoney(v.s.subtotal, cur)}</dd>
          {Number(v.s.discount) ? (
            <>
              <dt className="text-text-muted">Descuento</dt>
              <dd className="text-right font-mono">− {formatMoney(v.s.discount, cur)}</dd>
            </>
          ) : null}
          <dt className="font-medium">Total</dt>
          <dd className="text-right font-mono text-[18px] font-semibold">{formatMoney(v.s.total, cur)}</dd>
        </dl>
      </Card>
    </>
  );
}
