import { PRODUCT_TEMPLATE } from "@agencyos/modules/shop/import";
import { Card, PageHeader } from "@agencyos/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ProductImport } from "@/components/shop/product-import";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Importar productos" };

export default async function ImportProductsPage() {
  const sc = await requireShopCtx();
  if (sc.role === "seller") redirect("/comercio/productos");
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/comercio/productos" className="hover:text-text">
            Productos
          </Link>
        }
        title="Importar productos"
        description="Cargá el catálogo de una vez o actualizá la lista de precios desde Excel o Google Sheets."
      />
      <Card className="mb-5 p-5">
        <ProductImport template={PRODUCT_TEMPLATE} />
      </Card>
      <p className="text-[14px] text-text-muted">
        Para cambiar precios en masa:{" "}
        <a href="/comercio/productos/exportar" className="text-accent-text underline">
          descargá tus productos en CSV
        </a>
        , editá los precios en Excel, guardalo como CSV y volvé a importarlo acá.
      </p>
    </>
  );
}
