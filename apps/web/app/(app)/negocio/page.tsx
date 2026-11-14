import { cmpMoney, formatDate, formatMoney, L, label, subMoney } from "@agencyos/core";
import { businessKpis, type Range, resolveRange } from "@agencyos/modules/business/queries";
import { listPipelineStages } from "@agencyos/modules/crm/stages";
import { effectiveHourlyRate, hoursLabel } from "@agencyos/modules/time/duration";
import { minutesByClient, targetRate } from "@agencyos/modules/time/queries";
import { BarPairs, BlockCard, Card, EmptyState, HBars, PageHeader, Tabs } from "@agencyos/ui";
import { Activity, CalendarClock, ChartNoAxesCombined, Target, TrendingUp } from "lucide-react";
import Link from "next/link";
import { ActivityList } from "@/components/activity-list";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Negocio" };

type M = { currency: string; total: string }[];
const sum = (list: M, cur: string) => list.find((x) => x.currency === cur)?.total ?? "0";
const currencies = (...lists: M[]) => [...new Set(lists.flat().map((x) => x.currency))];

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev && !now) return null;
  if (!prev) return <span className="font-mono text-[12px] text-text-faint">sin período anterior</span>;
  const d = Math.round(((now - prev) / Math.abs(prev)) * 100);
  return (
    <span className={`font-mono text-[12px] ${d >= 0 ? "text-success" : "text-danger"}`}>
      {d >= 0 ? "▲" : "▼"} {Math.abs(d)}% vs. anterior
    </span>
  );
}

function Kpi({
  title,
  children,
  empty,
  href,
}: {
  title: string;
  children?: React.ReactNode;
  empty?: { text: string; action: string; href: string } | null;
  href?: string;
}) {
  const body = (
    <Card className="flex min-h-32 flex-col gap-1.5 p-4 md:p-5">
      <p className="text-[13px] text-text-muted">{title}</p>
      {empty ? (
        <p className="text-[13px] text-text-faint">
          {empty.text}{" "}
          <Link href={empty.href} className="text-accent hover:underline">
            {empty.action}
          </Link>
        </p>
      ) : (
        children
      )}
    </Card>
  );
  return href && !empty ? (
    <Link href={href} className="block hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function BusinessPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const range = (["mes", "trimestre", "anio", "personalizado"].includes(sp.rango ?? "") ? sp.rango : "mes") as Range;
  const r = resolveRange(range, undefined, sp.desde, sp.hasta);
  const k = await businessKpis(ctx, r);
  const [hoursOf, pipelineStages] = await Promise.all([minutesByClient(ctx, [...new Set(k.profit.map((p) => p.id))], r.start, r.end), listPipelineStages(ctx)]);
  const target = targetRate(ctx);
  const curs = currencies(k.income, k.expense);
  const rate = k.quotes.accepted + k.quotes.rejected ? Math.round((k.quotes.accepted / (k.quotes.accepted + k.quotes.rejected)) * 100) : null;
  const inProgress = k.projectsByStatus.find((p) => p.status === "in_progress")?.n ?? 0;
  const months = [...new Set(k.monthly.map((m) => m.month))].sort();
  const MS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const STAGES = ["new", "contacted", "meeting", "proposal_sent", "negotiation"];
  const pipeCurrencies = [...new Set(k.pipeline.map((p) => p.currency))];

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow={`${formatDate(r.start)} → ${formatDate(r.end)}`}
        title="Negocio"
        description="Indicadores calculados solo con tus datos reales."
        accent="#7C5CFF"
      />
      <Tabs
        active={range}
        items={[
          { key: "mes", label: "Mes", href: "/negocio?rango=mes" },
          { key: "trimestre", label: "Trimestre", href: "/negocio?rango=trimestre" },
          { key: "anio", label: "Año", href: "/negocio?rango=anio" },
          { key: "personalizado", label: "Personalizado", href: "/negocio?rango=personalizado" },
        ]}
      />
      {range === "personalizado" ? (
        <form className="mb-5 flex flex-wrap items-end gap-2" action="/negocio">
          <input type="hidden" name="rango" value="personalizado" />
          <label className="flex flex-col gap-1 text-[13px] text-text-muted">
            Desde
            <input
              type="date"
              name="desde"
              defaultValue={sp.desde ?? r.start}
              className="h-10 rounded-md border border-border bg-bg-elevated px-2 text-base text-text md:text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-text-muted">
            Hasta
            <input
              type="date"
              name="hasta"
              defaultValue={sp.hasta ?? r.end}
              className="h-10 rounded-md border border-border bg-bg-elevated px-2 text-base text-text md:text-sm"
            />
          </label>
          <button type="submit" className="h-10 rounded-md border border-border px-4 text-sm">
            Aplicar
          </button>
        </form>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Kpi
          title="Clientes activos"
          href="/crm/clientes"
          empty={k.clientsActive ? null : { text: "Sin clientes activos.", action: "Crear cliente", href: "/crm/clientes/nuevo" }}
        >
          <p className="font-mono text-[30px] tabular-nums">{k.clientsActive}</p>
        </Kpi>
        <Kpi
          title="Proyectos en curso"
          href="/proyectos"
          empty={k.projectsByStatus.length ? null : { text: "Sin proyectos.", action: "Nuevo proyecto", href: "/proyectos/nuevo" }}
        >
          <p className="font-mono text-[30px] tabular-nums">{inProgress}</p>
          <p className="text-[12px] text-text-muted">
            {k.projectsByStatus
              .filter((p) => p.status !== "in_progress")
              .map((p) => `${p.n} ${label(L.projectStatus, p.status).toLowerCase()}`)
              .join(" · ")}
          </p>
        </Kpi>
        <Kpi title="Tareas" href="/tareas">
          <p className="font-mono text-[30px] tabular-nums">
            {k.tasks.open}
            <span className="ml-2 text-[14px] text-text-muted">pendientes</span>
          </p>
          <p className="text-[12px]">
            <span className={k.tasks.overdue ? "text-danger" : "text-text-muted"}>{k.tasks.overdue} vencidas</span> ·{" "}
            <span className="text-text-muted">{k.tasks.done} hechas en el período</span>
          </p>
        </Kpi>
        <Kpi
          title="Presupuestos"
          href="/presupuestos"
          empty={k.quotes.sent || k.quotes.accepted ? null : { text: "Sin presupuestos en el período.", action: "Armar uno", href: "/presupuestos/nuevo" }}
        >
          <p className="font-mono text-[30px] tabular-nums">
            {rate === null ? "—" : `${rate}%`}
            <span className="ml-2 text-[14px] text-text-muted">aceptación</span>
          </p>
          <p className="text-[12px] text-text-muted">
            {k.quotes.sent} enviados · {k.quotes.accepted} aceptados · {k.quotes.rejected} rechazados
          </p>
          {k.acceptedAmount.map((a) => (
            <p key={a.currency} className="font-mono text-[13px]">
              {formatMoney(a.total, a.currency)} aceptado
            </p>
          ))}
        </Kpi>
        {(curs.length ? curs : ["ARS"]).map((c) => (
          <Kpi
            key={`in-${c}`}
            title={`Ingresos ${c}`}
            href="/finanzas/movimientos"
            empty={curs.length ? null : { text: "Sin movimientos.", action: "Registrá tu primer ingreso", href: "/finanzas/movimientos?nuevo=1" }}
          >
            <p className="font-mono text-[26px] tabular-nums">{formatMoney(sum(k.income, c), c)}</p>
            <Delta now={Number(sum(k.income, c))} prev={Number(sum(k.prevIncome, c))} />
          </Kpi>
        ))}
        {curs.map((c) => (
          <Kpi key={`res-${c}`} title={`Resultado ${c}`}>
            <p className={`font-mono text-[26px] tabular-nums ${Number(subMoney(sum(k.income, c), sum(k.expense, c))) < 0 ? "text-danger" : ""}`}>
              {formatMoney(subMoney(sum(k.income, c), sum(k.expense, c)), c)}
            </p>
            <p className="text-[12px] text-text-muted">gastos {formatMoney(sum(k.expense, c), c)}</p>
          </Kpi>
        ))}
        <Kpi
          title="Por cobrar"
          href="/finanzas/por-cobrar"
          empty={k.receivable.length ? null : { text: "Nada por cobrar.", action: "Ver cobros", href: "/finanzas/por-cobrar" }}
        >
          {k.receivable.map((x) => (
            <p key={x.currency} className="font-mono text-[22px] text-success tabular-nums">
              {formatMoney(x.total, x.currency)}
            </p>
          ))}
        </Kpi>
        <Kpi
          title="Por pagar"
          href="/finanzas/por-pagar"
          empty={k.payable.length ? null : { text: "Nada por pagar.", action: "Ver pagos", href: "/finanzas/por-pagar" }}
        >
          {k.payable.map((x) => (
            <p key={x.currency} className="font-mono text-[22px] text-warning tabular-nums">
              {formatMoney(x.total, x.currency)}
            </p>
          ))}
        </Kpi>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <BlockCard icon={<Target />} title="Pipeline del CRM (ponderado)">
          {k.pipeline.length ? (
            pipeCurrencies.map((c) => (
              <div key={c} className="mb-3">
                <p className="mb-2 font-mono text-[11px] text-text-faint">{c}</p>
                <HBars
                  data={STAGES.map((s) => {
                    const row = k.pipeline.find((p) => p.stage === s && p.currency === c);
                    return {
                      label: `${pipelineStages.find((x) => x.key === s)?.name ?? label(L.stage, s)} (${row?.n ?? 0})`,
                      value: Number(row?.weighted ?? 0),
                      display: formatMoney(row?.weighted ?? "0", c),
                    };
                  })}
                  color="var(--accent-2)"
                />
              </div>
            ))
          ) : (
            <EmptyState
              compact
              icon={<Target />}
              title="Sin oportunidades abiertas"
              action={
                <Link href="/crm/oportunidades" className="text-[13px] text-accent hover:underline">
                  Ir al pipeline
                </Link>
              }
            />
          )}
        </BlockCard>
        <BlockCard icon={<ChartNoAxesCombined />} title="Ingresos vs. gastos · 12 meses (ARS)">
          {months.length ? (
            <BarPairs
              data={months.map((m) => ({
                label: MS[Number(m.slice(5, 7)) - 1] ?? m,
                a: Number(k.monthly.find((x) => x.month === m && x.kind === "income")?.total ?? 0),
                b: Number(k.monthly.find((x) => x.month === m && x.kind === "expense")?.total ?? 0),
              }))}
            />
          ) : (
            <EmptyState compact icon={<ChartNoAxesCombined />} title="Sin movimientos en ARS" />
          )}
        </BlockCard>
        <BlockCard icon={<TrendingUp />} title="Rentabilidad top 5 por cliente">
          {k.profit.length ? (
            <ul className="flex flex-col gap-2 text-[14px]">
              {k.profit.map((p) => {
                const minutes = hoursOf.get(p.id) ?? 0;
                // Tarifa efectiva = ingreso cobrado del período ÷ horas registradas (por moneda, sin convertir).
                const eff = minutes ? effectiveHourlyRate(p.income, minutes) : null;
                const below = eff && target && target.currency === p.currency ? cmpMoney(eff, target.amount) < 0 : false;
                return (
                  <li key={p.id + p.currency} className="flex justify-between gap-3 border-b border-border pb-2 last:border-0">
                    <span className="min-w-0">
                      <Link href={`/crm/clientes/${p.id}`} className="block truncate hover:underline">
                        {p.name}
                      </Link>
                      {minutes ? (
                        <span className="font-mono text-[12px] text-text-muted">
                          {hoursLabel(minutes)} h ·{" "}
                          <span className={below ? "text-warning" : undefined}>{eff ? `${formatMoney(eff, p.currency)}/h` : "—"}</span>
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono">{formatMoney(p.result, p.currency)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState compact icon={<TrendingUp />} title="Sin datos" description="Asigná clientes a tus ingresos y gastos para ver la rentabilidad." />
          )}
        </BlockCard>
        <BlockCard icon={<CalendarClock />} title="Próximos vencimientos · 30 días">
          {k.upcoming.length ? (
            <ul className="flex flex-col gap-2 text-[14px]">
              {k.upcoming.map((u) => (
                <li key={u.kind + u.title + u.date} className="flex justify-between gap-3">
                  <Link href={u.href} className="hover:underline">
                    {u.title} <span className="text-[12px] text-text-muted">· {u.kind}</span>
                  </Link>
                  <span className="font-mono text-text-muted">{formatDate(u.date)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={<CalendarClock />} title="Nada vence en 30 días" />
          )}
        </BlockCard>
      </div>
      <BlockCard icon={<Activity />} title="Actividad reciente" className="mt-4">
        <ActivityList rows={k.activity} />
      </BlockCard>
    </div>
  );
}
