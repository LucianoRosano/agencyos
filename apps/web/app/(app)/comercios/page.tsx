import { can, formatMoney, relativeFromDate } from "@agencyos/core";
import { listShops } from "@agencyos/modules/shop/service";
import { Badge, Card, EmptyState, PageHeader } from "@agencyos/ui";
import { Store } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NewShopSheet, ShopRowActions } from "@/components/shop/agency-ui";
import { clientOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Comercios (SaaS)" };

/** Panel de administración del SaaS: los comercios que usan el sistema de gestión, con su actividad del mes. */
export default async function ShopsAdminPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "manage", "settings")) redirect("/hoy");
  const [shops, clients] = await Promise.all([listShops(ctx), clientOpts(ctx)]);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="SaaS de gestión"
        title="Comercios"
        description="Sistema de gestión para tus clientes con comercio: ventas, stock, pedidos, clientes, estadísticas y reportes automáticos. Cada comercio entra en /comercio con sus usuarios."
        accent="#34D399"
        actions={<NewShopSheet clients={clients} />}
      />
      {shops.length ? (
        <ul className="flex flex-col gap-2" data-testid="shop-admin-list">
          {shops.map(({ s, clientName, members, products, salesMonth, salesCount, pendingInvite }) => (
            <li key={s.id}>
              <Card className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-medium">{s.name}</span>
                    {s.status === "suspended" ? <Badge tone="danger">Suspendido</Badge> : null}
                    {pendingInvite ? <Badge tone="warning">Invitación pendiente</Badge> : null}
                  </span>
                  <span className="block text-[13px] text-text-muted">
                    {clientName ? (
                      <Link href={`/crm/clientes/${s.clientId}`} className="hover:underline">
                        {clientName}
                      </Link>
                    ) : (
                      "Sin cliente del CRM"
                    )}
                    {` · ${members} usuario${members === 1 ? "" : "s"} · ${products} productos`}
                    {s.lastActivityAt ? ` · actividad ${relativeFromDate(s.lastActivityAt)}` : ""}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-mono text-[16px]">{formatMoney(salesMonth, s.currency)}</span>
                  <span className="block text-[12px] text-text-muted">{salesCount} ventas este mes</span>
                </span>
                <ShopRowActions id={s.id} status={s.status} name={s.name} />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="p-2">
          <EmptyState
            icon={<Store />}
            title="Todavía no hay comercios"
            description="Creá el primero para un cliente con negocio (librería, kiosco, almacén): recibe un enlace para entrar y empezar a vender."
          />
        </Card>
      )}
    </div>
  );
}
