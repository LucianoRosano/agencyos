import { formatMoney } from "@agencyos/core";
import { listProducts } from "@agencyos/modules/shop/service";
import { Button, Card, cn, EmptyState, PageHeader } from "@agencyos/ui";
import { FileUp, Package, Search } from "lucide-react";
import Link from "next/link";
import { NewProductSheet } from "@/components/shop/shop-ui";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Productos" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sc = await requireShopCtx();
  const sp = await searchParams;
  const low = sp.stock === "bajo";
  const products = await listProducts(sc, { q: sp.q, low, inactive: sp.bajas === "1" });
  const admin = sc.role !== "seller";
  return (
    <>
      <PageHeader
        title="Productos"
        description="Catálogo, precios y stock."
        accent="#4F7A52"
        actions={
          admin ? (
            <>
              <Button asChild variant="secondary">
                <Link href="/comercio/productos/importar">
                  <FileUp className="size-4" aria-hidden /> Importar
                </Link>
              </Button>
              <NewProductSheet />
            </>
          ) : undefined
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search" action="/comercio/productos">
        <label htmlFor="prod-q" className="sr-only">
          Buscar productos
        </label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            id="prod-q"
            name="q"
            defaultValue={sp.q}
            placeholder="Nombre, código o categoría"
            className="h-11 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated pr-3 pl-9 text-base text-text md:text-sm"
          />
        </div>
        <Link
          href={low ? "/comercio/productos" : "/comercio/productos?stock=bajo"}
          aria-current={low ? "true" : undefined}
          className={cn(
            "inline-flex h-11 items-center rounded-full border px-4 text-[14px]",
            low ? "border-accent bg-accent-soft" : "border-border text-text-muted",
          )}
        >
          Stock bajo
        </Link>
      </form>
      {products.length ? (
        <Card className="px-4">
          <ul className="divide-y divide-border" data-testid="product-list">
            {products.map((p) => (
              <li key={p.id}>
                <Link href={`/comercio/productos/${p.id}`} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:opacity-90">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{p.name}</span>
                    <span className="block truncate font-mono text-[12px] text-text-muted">
                      {[p.sku, p.category].filter(Boolean).join(" · ") || "Sin código"}
                    </span>
                  </span>
                  <span className={cn("font-mono text-[13px]", p.stock <= p.minStock ? "text-warning" : "text-text-muted")}>stock {p.stock}</span>
                  <span className="w-28 text-right font-mono text-[15px]">{formatMoney(p.price, sc.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-2">
          <EmptyState
            icon={<Package />}
            title={sp.q || low ? "Sin resultados" : "Todavía no hay productos"}
            description={admin && !sp.q ? "Cargá tu catálogo con «Nuevo producto»." : undefined}
          />
        </Card>
      )}
    </>
  );
}
