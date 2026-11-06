import { assetFormOptions, listProducts } from "@agencyos/modules/assets/queries";
import { Badge, Card, EmptyState } from "@agencyos/ui";
import { ChevronRight, Package } from "lucide-react";
import Link from "next/link";
import { AssetsHeader } from "@/components/assets/header";
import { NewProductButton } from "@/components/assets/product-ui";
import { PRODUCT_KIND } from "@/components/assets/shared";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Productos propios · Activos técnicos" };

export default async function ProductosPage() {
  const ctx = await requireCtx();
  const [rows, options] = await Promise.all([listProducts(ctx), assetFormOptions(ctx)]);
  return (
    <div className="mx-auto max-w-6xl">
      <AssetsHeader
        active="productos"
        title="Productos propios"
        description="Un producto, muchas instalaciones: versiones con changelog y qué versión hay en cada cliente."
        actions={<NewProductButton repositories={options.repositories} />}
        counts={{ productos: rows.length }}
      />
      {rows.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/activos/productos/${p.id}`} className="group block h-full">
                <Card className="flex h-full flex-col gap-3 p-4 transition-colors group-hover:border-border-strong md:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">{PRODUCT_KIND[p.kind] ?? p.kind}</p>
                      <h3 className="mt-1 truncate text-[16px] font-medium text-text">{p.name}</h3>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-text-faint" />
                  </div>
                  {p.description ? <p className="line-clamp-2 text-[13px] text-text-muted">{p.description}</p> : null}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    <Badge tone={p.latest ? "accent" : "neutral"}>{p.latest ? `v${p.latest}` : "sin versiones"}</Badge>
                    <span className="text-[13px] text-text-muted">
                      {p.installations} {p.installations === 1 ? "instalación activa" : "instalaciones activas"}
                    </span>
                    {p.outdated ? (
                      <Badge tone="warning">
                        {p.outdated} desactualizada{p.outdated === 1 ? "" : "s"}
                      </Badge>
                    ) : null}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={<Package />}
            title="Sin productos propios"
            description="Cargá lo que instalás en más de un cliente (LibreríaOS Fiscal, Panel, Caja…). Al publicar una versión nueva te crea las tareas para actualizar cada instalación."
            action={<NewProductButton repositories={options.repositories} label="Crear el primero" />}
          />
        </Card>
      )}
    </div>
  );
}
