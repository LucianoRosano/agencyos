import { formatDateTime } from "@agencyos/core";
import { getProduct, productMoves } from "@agencyos/modules/shop/service";
import { Card, PageHeader, SectionLabel } from "@agencyos/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditProductForm, ProductActiveButton, StockForm } from "@/components/shop/shop-ui";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Producto" };

const REASON: Record<string, string> = {
  sale: "Venta",
  sale_cancel: "Venta anulada",
  purchase: "Compra",
  adjust: "Ajuste",
  return: "Devolución",
  initial: "Stock inicial",
};

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const sc = await requireShopCtx();
  const id = (await params).id;
  const p = await getProduct(sc, id);
  if (!p) notFound();
  const moves = await productMoves(sc, id);
  const admin = sc.role !== "seller";
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/comercio/productos" className="hover:text-text">
            Productos
          </Link>
        }
        title={p.name}
        description={`Stock actual: ${p.stock} · mínimo ${p.minStock}${p.active ? "" : " · dado de baja"}`}
        accent="#34D399"
        actions={admin ? <ProductActiveButton id={p.id} active={p.active} /> : undefined}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {admin ? (
            <>
              <Card className="p-5">
                <SectionLabel className="mb-3">Entrada o ajuste de stock</SectionLabel>
                <StockForm id={p.id} />
              </Card>
              <Card className="p-5">
                <SectionLabel className="mb-3">Datos del producto</SectionLabel>
                <EditProductForm
                  id={p.id}
                  d={{ name: p.name, sku: p.sku, barcode: p.barcode, category: p.category, price: p.price, cost: p.cost, minStock: p.minStock }}
                />
              </Card>
            </>
          ) : (
            <Card className="p-5 text-[14px] text-text-muted">Los precios y el stock los cambia el dueño o un administrador.</Card>
          )}
        </div>
        <Card className="h-fit p-5">
          <SectionLabel className="mb-3">Movimientos</SectionLabel>
          <ul className="flex flex-col gap-2 text-[13px]" data-testid="stock-moves">
            {moves.map((m) => (
              <li key={m.id} className="flex items-baseline justify-between gap-3 border-b border-border pb-2 last:border-0">
                <span>
                  {REASON[m.reason] ?? m.reason}
                  {m.note ? <span className="text-text-muted"> · {m.note}</span> : null}
                  <span className="block font-mono text-[11px] text-text-muted">{formatDateTime(m.at)}</span>
                </span>
                <span className={m.qty < 0 ? "font-mono text-danger" : "font-mono text-success"}>
                  {m.qty > 0 ? "+" : ""}
                  {m.qty} → {m.stockAfter}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
