import { PageHeader } from "@agencyos/ui";
import { Pos } from "@/components/shop/pos";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Vender" };

export default async function SellPage() {
  const sc = await requireShopCtx();
  return (
    <>
      <PageHeader title="Vender" description="Buscá o escaneá los productos, elegí el medio de pago y cobrá." accent="#34D399" />
      <Pos mode="sale" currency={sc.currency} canDiscount={sc.role !== "seller"} />
    </>
  );
}
