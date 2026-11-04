import { endOfMonth, formatMoney, L, label, monthName, todayAR } from "@agencyos/core";
import { monthlyReport, profitability } from "@agencyos/modules/finance/queries";
import { BlockCard, Button, Card, cn, EmptyState, HBars } from "@agencyos/ui";
import { BriefcaseBusiness, CalendarRange, ChartColumn, Download, FolderKanban, TriangleAlert } from "lucide-react";
import { FinanceHeader, NoFinanceAccess } from "@/components/finance/finance-header";
import { financePage, qs, type SP } from "@/components/finance/server";

export const metadata = { title: "Reportes · Finanzas" };

const ctl = "h-10 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base text-text md:text-sm select-chevron appearance-none pr-9";
const money = (v: string, c: string) => formatMoney(v, c);

export default async function ReportesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = await financePage(sp);
  if (!f.allowed) return <NoFinanceAccess />;
  const today = todayAR();
  const thisYear = Number(today.slice(0, 4));
  const year = Number(sp.anio) >= 2000 && Number(sp.anio) <= thisYear + 1 ? Number(sp.anio) : thisYear;
  const month = Number(sp.mes) >= 1 && Number(sp.mes) <= 12 ? Number(sp.mes) : null;
  const currency = sp.moneda === "USD" ? "USD" : "ARS";
  const yFrom = `${year}-01-01`;
  const yTo = `${year}-12-31`;
  const pFrom = month ? `${year}-${String(month).padStart(2, "0")}-01` : yFrom;
  const pTo = month ? endOfMonth(pFrom) : yTo;
  const base = { ledgerId: f.ledgerId, currency } as const;
  const [yearRep, periodRep, prof] = await Promise.all([
    monthlyReport(f.ctx, { ...base, from: yFrom, to: yTo }),
    month ? monthlyReport(f.ctx, { ...base, from: pFrom, to: pTo }) : Promise.resolve(null),
    profitability(f.ctx, { ...base, from: pFrom, to: pTo }),
  ]);
  const rep = periodRep ?? yearRep;
  const periodLabel = month ? `${monthName(month)} ${year}` : `Año ${year}`;
  const keep = {
    anio: String(year),
    mes: month ? String(month) : undefined,
    moneda: currency,
  };
  const csv = (tipo: string) => `/finanzas/reportes/csv${qs(f.ledgerId, { tipo, desde: pFrom, hasta: pTo, moneda: currency })}`;
  const hasData = yearRep.months.length > 0 || yearRep.unconverted.length > 0;
  const allUnconverted = [...rep.unconverted];
  return (
    <div className="mx-auto max-w-6xl">
      <FinanceHeader active="reportes" title="Reportes" ledgers={f.ledgers} ledgerId={f.ledgerId} extraQuery={keep} />
      <form action="/finanzas/reportes" className="mb-5 grid grid-cols-2 gap-3 md:flex md:items-end">
        {f.ledgerId ? <input type="hidden" name="libro" value={f.ledgerId} /> : null}
        <label className="flex flex-col gap-1.5 text-[13px] text-text-muted">
          Año
          <select name="anio" defaultValue={String(year)} className={ctl}>
            {Array.from({ length: 6 }, (_, i) => thisYear - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-text-muted">
          Período
          <select name="mes" defaultValue={month ? String(month) : ""} className={ctl}>
            <option value="">Todo el año</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-text-muted">
          Moneda del reporte
          <select name="moneda" defaultValue={currency} className={ctl}>
            <option value="ARS">ARS · pesos</option>
            <option value="USD">USD · dólares</option>
          </select>
        </label>
        <Button type="submit" variant="secondary" className="self-end">
          Ver
        </Button>
        <div className="col-span-2 flex flex-wrap gap-2 md:ml-auto">
          <Button asChild variant="ghost" size="sm">
            <a href={csv("mensual")}>
              <Download className="size-4" /> Resumen CSV
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={csv("movimientos")}>
              <Download className="size-4" /> Movimientos CSV
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={csv("rentabilidad")}>
              <Download className="size-4" /> Rentabilidad CSV
            </a>
          </Button>
        </div>
      </form>

      {!hasData ? (
        <Card>
          <EmptyState
            icon={<ChartColumn />}
            title={`Sin movimientos en ${year}`}
            description="Los reportes se arman solos con los ingresos y gastos que registres: por mes, por categoría y la rentabilidad por cliente y proyecto."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4 md:gap-5">
          {allUnconverted.length ? (
            <div role="note" className="flex gap-3 rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft p-4 text-[13px] text-text">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="font-medium">Hay movimientos en otra moneda sin cotización: no se suman a los totales en {currency}.</p>
                <ul className="mt-1.5 flex flex-col gap-0.5 text-text-muted">
                  {allUnconverted.map((u) => (
                    <li key={`${u.currency}-${u.kind}`}>
                      {label(L.txKind, u.kind)}s en {u.currency}: <span className="font-mono tabular-nums text-text">{formatMoney(u.total, u.currency)}</span> ({u.n} mov.)
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-text-muted">Para incluirlos, cargá la cotización (ARS por US$ 1) en cada movimiento. Nunca se usan tasas inventadas.</p>
              </div>
            </div>
          ) : null}

          <section aria-label={`Totales · ${periodLabel}`} className="grid grid-cols-3 gap-3 md:gap-4">
            {[
              { t: "Ingresos", v: rep.totals.income, cls: "text-success" },
              { t: "Gastos", v: rep.totals.expense, cls: "text-text" },
              {
                t: "Resultado",
                v: rep.totals.result,
                cls: Number(rep.totals.result) < 0 ? "text-danger" : "text-text",
              },
            ].map((x) => (
              <Card key={x.t} className="p-3 md:p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted md:text-[11px]">
                  {x.t} · {periodLabel}
                </p>
                <p className={cn("mt-1.5 font-mono text-[15px] font-semibold tabular-nums md:text-[24px]", x.cls)}>{money(x.v, currency)}</p>
              </Card>
            ))}
          </section>

          <div className="grid gap-4 md:gap-5 lg:grid-cols-2">
            <BlockCard icon={<CalendarRange />} title={`Mensual · ${year} · ${currency}`}>
              <table className="w-full font-mono text-[12px] tabular-nums md:text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-text-faint">
                    <th className="py-2 font-normal">Mes</th>
                    <th className="py-2 text-right font-normal">Ingresos</th>
                    <th className="py-2 text-right font-normal">Gastos</th>
                    <th className="py-2 text-right font-normal">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {yearRep.months.map((m) => (
                    <tr key={m.month} className={cn("border-t border-border", month && Number(m.month.slice(5, 7)) === month && "bg-surface-2")}>
                      <td className="py-2 font-sans text-text-muted">{monthName(Number(m.month.slice(5, 7))).slice(0, 3)}</td>
                      <td className="py-2 text-right text-success">{money(m.income, currency)}</td>
                      <td className="py-2 text-right text-text">{money(m.expense, currency)}</td>
                      <td className={cn("py-2 text-right", Number(m.result) < 0 ? "text-danger" : "text-text")}>{money(m.result, currency)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border font-semibold">
                    <td className="py-2 font-sans text-text">Total</td>
                    <td className="py-2 text-right text-success">{money(yearRep.totals.income, currency)}</td>
                    <td className="py-2 text-right">{money(yearRep.totals.expense, currency)}</td>
                    <td className={cn("py-2 text-right", Number(yearRep.totals.result) < 0 ? "text-danger" : "")}>{money(yearRep.totals.result, currency)}</td>
                  </tr>
                </tbody>
              </table>
            </BlockCard>

            <BlockCard icon={<ChartColumn />} title={`Por categoría · ${periodLabel}`}>
              <div className="flex flex-col gap-5">
                {(["income", "expense"] as const).map((k) => (
                  <div key={k}>
                    <p className="mb-2 text-[13px] text-text-muted">{k === "income" ? "Ingresos" : "Gastos"}</p>
                    {rep.categories[k].length ? (
                      <HBars
                        data={rep.categories[k].map((c) => ({
                          label: c.name,
                          value: Number(c.total),
                          display: money(c.total, currency),
                        }))}
                        color={k === "income" ? "var(--success)" : "var(--accent)"}
                      />
                    ) : (
                      <p className="text-[13px] text-text-faint">Sin {k === "income" ? "ingresos" : "gastos"} en el período.</p>
                    )}
                  </div>
                ))}
              </div>
            </BlockCard>
          </div>

          <div className="grid gap-4 md:gap-5 lg:grid-cols-2">
            {(
              [
                {
                  key: "clients",
                  title: "Rentabilidad por cliente",
                  icon: <BriefcaseBusiness />,
                  rows: prof.clients,
                  empty: "Asigná cliente a los ingresos y gastos para ver cuánto te deja cada uno.",
                },
                {
                  key: "projects",
                  title: "Rentabilidad por proyecto",
                  icon: <FolderKanban />,
                  rows: prof.projects,
                  empty: "Asigná proyecto a los ingresos y gastos para ver cuánto te deja cada uno.",
                },
              ] as const
            ).map((b) => (
              <BlockCard key={b.key} icon={b.icon} title={`${b.title} · ${periodLabel}`}>
                {b.rows.length ? (
                  <table className="w-full table-fixed text-[12px] md:text-[13px]">
                    <thead>
                      <tr className="text-left font-mono text-[11px] uppercase tracking-[0.12em] text-text-faint">
                        <th className="w-[34%] py-2 font-normal">{b.key === "clients" ? "Cliente" : "Proyecto"}</th>
                        <th className="py-2 text-right font-normal">Cobrado</th>
                        <th className="py-2 text-right font-normal">Gastos</th>
                        <th className="py-2 text-right font-normal">Resultado</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono tabular-nums">
                      {b.rows.map((r) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="truncate py-2 font-sans text-text" title={r.name}>
                            {r.name}
                            {r.unconverted ? (
                              <span className="ml-1 text-warning" title={`${r.unconverted} movimiento(s) sin cotización, fuera del cálculo`}>
                                *
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 text-right text-success">{money(r.income, currency)}</td>
                          <td className="py-2 text-right">{money(r.expense, currency)}</td>
                          <td className={cn("py-2 text-right", Number(r.result) < 0 ? "text-danger" : "text-text")}>{money(r.result, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState compact title="Sin datos en el período" description={b.empty} />
                )}
                {b.rows.some((r) => r.unconverted) ? <p className="mt-2 text-[12px] text-warning">* Tiene movimientos en otra moneda sin cotización, fuera del cálculo.</p> : null}
              </BlockCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
