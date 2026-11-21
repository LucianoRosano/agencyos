import { formatDate, formatMoney, todayAR } from "@agencyos/core";
import { shopStats } from "@agencyos/modules/shop/service";
import { Card, EmptyState, HBars, PageHeader, SectionLabel, Sparkline } from "@agencyos/ui";
import { PackageX, ShoppingBag, TrendingUp } from "lucide-react";
import Link from "next/link";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Inicio" };

const ops = (n: number) => `${n} operaci${n === 1 ? "ón" : "ones"}`;

function Kpi({ title, value, detail, href }: { title: string; value: string; detail?: string; href?: string }) {
  const body = (
    <Card className="flex h-full flex-col gap-1 p-4">
      <span className="text-[13px] text-text-muted">{title}</span>
      <span className="font-mono text-[24px] tabular-nums">{value}</span>
      {detail ? <span className="text-[12px] text-text-muted">{detail}</span> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function ShopHome() {
  const sc = await requireShopCtx();
  const st = await shopStats(sc);
  const cur = sc.currency;
  const prev = Number(st.month.prev);
  const change = prev > 0 ? Math.round(((Number(st.month.total) - prev) / prev) * 100) : null;
  return (
    <>
      <PageHeader eyebrow={formatDate(todayAR())} title={`Hola, ${sc.user.name.split(" ")[0]}`} accent="#34D399" />
      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi title="Ventas de hoy" value={formatMoney(st.today.total, cur)} detail={ops(st.today.count)} href="/comercio/ventas" />
        <Kpi
          title="Ventas del mes"
          value={formatMoney(st.month.total, cur)}
          detail={change === null ? ops(st.month.count) : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)} % vs. mes anterior`}
        />
        <Kpi
          title="Ticket promedio"
          value={formatMoney(st.month.avgTicket, cur)}
          detail={st.month.margin ? `Ganancia del mes ${formatMoney(st.month.margin, cur)}` : "Cargá costos para ver la ganancia"}
        />
        <Kpi title="Pedidos pendientes" value={String(st.pendingOrders)} detail="Nuevos, en preparación o listos" href="/comercio/pedidos" />
      </section>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionLabel icon={<TrendingUp />} className="mb-3">
            Últimos 30 días
          </SectionLabel>
          {st.daily.some((d) => Number(d.total) > 0) ? (
            <>
              <Sparkline values={st.daily.map((d) => Number(d.total))} className="h-24 w-full" />
              <p className="mt-2 text-[12px] text-text-muted">Ventas por día (pesos).</p>
            </>
          ) : (
            <EmptyState
              compact
              icon={<ShoppingBag />}
              title="Todavía no hay ventas"
              action={
                <Link href="/comercio/vender" className="text-[14px] text-accent-text underline">
                  Hacer la primera
                </Link>
              }
            />
          )}
        </Card>
        <Card className="p-5">
          <SectionLabel className="mb-3">Lo más vendido · 30 días</SectionLabel>
          {st.top.length ? (
            <HBars
              data={st.top.map((t) => ({ label: `${t.name} (${t.qty})`, value: Number(t.total), display: formatMoney(t.total, cur) }))}
              color="var(--accent-2)"
            />
          ) : (
            <p className="text-[14px] text-text-muted">Aparece cuando registres ventas.</p>
          )}
        </Card>
        <Card className="p-5">
          <SectionLabel icon={<PackageX />} className="mb-3">
            Stock bajo
          </SectionLabel>
          {st.low.length ? (
            <ul className="flex flex-col gap-2 text-[14px]" data-testid="low-stock">
              {st.low.slice(0, 8).map((p) => (
                <li key={p.id} className="flex justify-between gap-3">
                  <Link href={`/comercio/productos/${p.id}`} className="truncate hover:underline">
                    {p.name}
                  </Link>
                  <span className="font-mono text-warning">
                    {p.stock} / mín. {p.minStock}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-text-muted">Todo el stock está por encima del mínimo.</p>
          )}
        </Card>
        <Card className="p-5">
          <SectionLabel className="mb-3">Mejores clientes · 30 días</SectionLabel>
          {st.customers.length ? (
            <ul className="flex flex-col gap-2 text-[14px]">
              {st.customers.map((c) => (
                <li key={c.name} className="flex justify-between gap-3">
                  <span className="truncate">{c.name}</span>
                  <span className="font-mono text-text-muted">{formatMoney(c.total, cur)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-text-muted">Asigná el cliente al vender para ver quién compra más.</p>
          )}
        </Card>
      </div>
    </>
  );
}
