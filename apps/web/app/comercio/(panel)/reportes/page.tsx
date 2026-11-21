import { formatDate, formatMoney } from "@agencyos/core";
import { currentWeekReport, listReports, type ShopReportData } from "@agencyos/modules/shop/report";
import { PAYMENT_LABEL } from "@agencyos/modules/shop/service";
import { Card, PageHeader, SectionLabel } from "@agencyos/ui";
import { requireShopCtx } from "@/lib/session";

export const metadata = { title: "Reportes" };

function Report({ d, start, end, currency }: { d: ShopReportData; start: string; end: string; currency: string }) {
  return (
    <div className="flex flex-col gap-3 text-[14px]">
      <p className="font-mono text-[12px] text-text-muted">
        {formatDate(start)} → {formatDate(end)}
      </p>
      <p>
        <span className="font-mono text-[22px]">{formatMoney(d.total, currency)}</span> en {d.count} ventas · ticket promedio{" "}
        {formatMoney(d.avgTicket, currency)}
        {d.changePct !== null ? (
          <span className={d.changePct >= 0 ? "text-success" : "text-danger"}>
            {" "}
            · {d.changePct >= 0 ? "▲" : "▼"} {Math.abs(d.changePct)} % vs. semana anterior
          </span>
        ) : null}
      </p>
      {d.bestDay ? (
        <p className="text-text-muted">
          Mejor día: {formatDate(d.bestDay.day)} ({formatMoney(d.bestDay.total, currency)}).
        </p>
      ) : null}
      {d.top.length ? (
        <div>
          <p className="mb-1 text-text-muted">Lo más vendido</p>
          <ul className="flex flex-col gap-1">
            {d.top.map((t) => (
              <li key={t.name} className="flex justify-between gap-3">
                <span className="truncate">
                  {t.name} · {t.qty} u.
                </span>
                <span className="font-mono">{formatMoney(t.total, currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {d.byPayment.length ? (
        <p className="text-text-muted">
          Por medio de pago:{" "}
          {d.byPayment.map((p) => `${PAYMENT_LABEL[p.method as keyof typeof PAYMENT_LABEL] ?? p.method} ${formatMoney(p.total, currency)}`).join(" · ")}
        </p>
      ) : null}
      <p className="text-text-muted">
        Pedidos entregados: {d.ordersDelivered} · pendientes: {d.ordersPending}
      </p>
      {d.lowStock.length ? <p className="text-warning">Stock bajo: {d.lowStock.map((l) => `${l.name} (${l.stock})`).join(", ")}</p> : null}
    </div>
  );
}

export default async function ReportsPage() {
  const sc = await requireShopCtx();
  const [now, past] = await Promise.all([currentWeekReport(sc), listReports(sc)]);
  return (
    <>
      <PageHeader
        title="Reportes"
        description="Cada lunes se arma solo el resumen de la semana anterior (y llega por email al dueño si está configurado)."
        accent="#34D399"
      />
      <Card className="mb-5 p-5" data-testid="report-current">
        <SectionLabel className="mb-3">Esta semana (hasta hoy)</SectionLabel>
        <Report d={now.data} start={now.start} end={now.end} currency={sc.currency} />
      </Card>
      {past.length ? (
        <>
          <SectionLabel className="mb-3">Semanas anteriores</SectionLabel>
          <div className="grid gap-4 md:grid-cols-2">
            {past.map((r) => (
              <Card key={r.id} className="p-5">
                <Report d={r.data as ShopReportData} start={r.periodStart} end={r.periodEnd} currency={sc.currency} />
              </Card>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[14px] text-text-muted">El primer reporte semanal aparece el lunes.</p>
      )}
    </>
  );
}
