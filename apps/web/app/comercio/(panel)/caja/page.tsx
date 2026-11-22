import { formatDate, formatMoney } from "@agencyos/core";
import { cashClose } from "@agencyos/modules/shop/cash";
import { Button, Card, EmptyState, PageHeader, SectionLabel } from "@agencyos/ui";
import { ChevronLeft, ChevronRight, FileText, Wallet } from "lucide-react";
import Link from "next/link";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Caja" };

const time = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(d)) : "—";

/** Cierre de caja del día: total por medio de pago, efectivo a contar, anuladas, vendedores y productos. */
export default async function CashPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const sc = await requireShopCtx();
  const c = await cashClose(sc, (await searchParams).dia);
  const cur = sc.currency;
  const m = (v: string) => formatMoney(v, cur);
  const pdf = (f: string) => `/comercio/caja/pdf?dia=${c.day}&formato=${f}`;
  const preferred = sc.settings.printFormat ?? "a4";
  return (
    <>
      <PageHeader
        title="Caja"
        description={c.isToday ? `Cierre de hoy, ${formatDate(c.day)}` : `Cierre del ${formatDate(c.day)}`}
        actions={
          <>
            <Button asChild variant="secondary">
              <a href={pdf(preferred)} target="_blank" rel="noopener">
                <FileText className="size-4" aria-hidden />
                Imprimir cierre
              </a>
            </Button>
            <Button asChild variant="ghost">
              <a href={pdf(preferred === "a4" ? "ticket80" : "a4")} target="_blank" rel="noopener">
                {preferred === "a4" ? "Ticket" : "En hoja A4"}
              </a>
            </Button>
          </>
        }
      />
      <nav aria-label="Cambiar de día" className="mb-5 flex items-center gap-2">
        <Button asChild variant="secondary" size="sm" className="h-10">
          <Link href={`/comercio/caja?dia=${c.prevDay}`} aria-label={`Día anterior, ${formatDate(c.prevDay)}`}>
            <ChevronLeft className="size-4" aria-hidden /> Anterior
          </Link>
        </Button>
        {c.nextDay ? (
          <Button asChild variant="secondary" size="sm" className="h-10">
            <Link href={`/comercio/caja?dia=${c.nextDay}`} aria-label={`Día siguiente, ${formatDate(c.nextDay)}`}>
              Siguiente <ChevronRight className="size-4" aria-hidden />
            </Link>
          </Button>
        ) : null}
        {!c.isToday ? (
          <Button asChild variant="ghost" size="sm" className="h-10">
            <Link href="/comercio/caja">Hoy</Link>
          </Button>
        ) : null}
      </nav>
      {c.count || c.cancelled.count ? (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="cash-kpis">
            {[
              ["Total vendido", m(c.total), true],
              ["Efectivo a contar", m(c.cash), false],
              ["Otros medios", m(c.nonCash), false],
              ["Ventas", `${c.count}`, false],
            ].map(([k, v, hl]) => (
              <Card key={String(k)} className="p-4">
                <p className="text-[13px] text-text-muted">{k}</p>
                <p className={`mt-1 font-serif text-[24px] leading-tight font-semibold tabular-nums ${hl ? "text-accent-text" : "text-text"}`}>{v}</p>
              </Card>
            ))}
          </div>
          <p className="text-[14px] text-text-muted">
            {c.units} unidades · primera venta {time(c.first)} · última {time(c.last)}
            {Number(c.discount) > 0 ? ` · descuentos ${m(c.discount)}` : ""}
            {c.cancelled.count ? ` · ${c.cancelled.count} ${c.cancelled.count === 1 ? "anulada" : "anuladas"} (${m(c.cancelled.total)}, no suman)` : ""}
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-5">
              <SectionLabel className="mb-3">Por medio de pago</SectionLabel>
              <ul className="divide-y divide-border text-[14px]" data-testid="cash-payments">
                {c.payments.map((p) => (
                  <li key={p.method} className="flex items-center justify-between gap-3 py-2.5">
                    <span>
                      {p.label} <span className="text-text-muted">· {p.count}</span>
                    </span>
                    <span className="font-mono">{m(p.total)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <SectionLabel className="mb-3">Por vendedor</SectionLabel>
              <ul className="divide-y divide-border text-[14px]">
                {c.sellers.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate">
                      {s.name} <span className="text-text-muted">· {s.count}</span>
                    </span>
                    <span className="font-mono">{m(s.total)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          {c.items.length ? (
            <Card className="p-5">
              <SectionLabel className="mb-3">Productos vendidos</SectionLabel>
              <ul className="divide-y divide-border text-[14px]">
                {c.items.map((i) => (
                  <li key={i.name} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate">
                      {i.name} <span className="text-text-muted">· {i.qty} u.</span>
                    </span>
                    <span className="font-mono">{m(i.total)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : (
        <Card className="p-2">
          <EmptyState
            icon={<Wallet />}
            title={c.isToday ? "Todavía no hay ventas hoy" : "Sin ventas ese día"}
            description="El cierre se arma solo con las ventas registradas en «Vender» y los pedidos entregados."
            action={
              <Button asChild variant="primary">
                <Link href="/comercio/vender">Ir a vender</Link>
              </Button>
            }
          />
        </Card>
      )}
    </>
  );
}
