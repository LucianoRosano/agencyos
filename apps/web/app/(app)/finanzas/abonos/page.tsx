import { diffDays, formatDate, formatMoney, L, label, todayAR } from "@agencyos/core";
import { listRetainers, retainerMrr } from "@agencyos/modules/retainers/service";
import { Badge, Card, cn, EmptyState, Progress, SectionLabel } from "@agencyos/ui";
import { CalendarClock, Repeat2 } from "lucide-react";
import Link from "next/link";
import { FinanceHeader, NoFinanceAccess } from "@/components/finance/finance-header";
import { LazyAdjustRetainersButton } from "@/components/finance/retainer-lazy";
import { NewRetainerButton, RetainerMenu } from "@/components/finance/retainer-ui";
import { financePage, type SP } from "@/components/finance/server";
import { clientOpts, projectOpts } from "@/lib/options";

export const metadata = { title: "Abonos · Finanzas" };

const fmtH = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;

export default async function AbonosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const f = await financePage(sp);
  if (!f.allowed) return <NoFinanceAccess />;
  const [rows, mrr, clients, projects] = await Promise.all([listRetainers(f.ctx), retainerMrr(f.ctx), clientOpts(f.ctx), projectOpts(f.ctx)]);
  const today = todayAR();
  return (
    <div className="mx-auto max-w-6xl">
      <FinanceHeader
        active="abonos"
        title="Abonos mensuales"
        description="Mantenimientos, hostings gestionados, SEO mensual: cada mes se genera solo el cobro."
        ledgers={f.ledgers}
        ledgerId={f.ledgerId}
        actions={
          <>
            <LazyAdjustRetainersButton
              rows={rows
                .filter((x) => x.r.status !== "cancelled")
                .map(({ r, clientName }) => ({ id: r.id, concept: r.concept, clientName, amount: r.amount, currency: r.currency }))}
            />
            <NewRetainerButton clients={clients} projects={projects} />
          </>
        }
      />
      {rows.length ? (
        <>
          <Card className="mb-5 flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <div>
              <SectionLabel icon={<Repeat2 />}>Ingreso recurrente mensual</SectionLabel>
              <p className="mt-1.5 text-[13px] text-text-muted">
                {mrr.count} abono{mrr.count === 1 ? "" : "s"} activo{mrr.count === 1 ? "" : "s"}. Cada moneda por separado.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2" data-testid="mrr">
              {mrr.byCurrency.length ? (
                mrr.byCurrency.map((c) => (
                  <div key={c.currency} className="md:text-right">
                    <p className="font-mono text-[11px] uppercase tracking-[0.04em] text-text-faint">{c.currency} / mes</p>
                    <p className="font-mono text-[26px] font-semibold tabular-nums text-text">{formatMoney(c.total, c.currency)}</p>
                  </div>
                ))
              ) : (
                <p className="text-[13px] text-text-muted">Sin abonos activos.</p>
              )}
            </div>
          </Card>
          <ul className="flex flex-col gap-2">
            {rows.map(({ r, clientName, projectName, minutesUsed }) => {
              const inc = r.hoursIncluded ? Math.round(Number(r.hoursIncluded) * 60) : 0;
              const pct = inc ? Math.min(100, Math.round(((minutesUsed ?? 0) / inc) * 100)) : 0;
              const over = inc > 0 && (minutesUsed ?? 0) > inc;
              const d = diffDays(r.nextIssueDate, today);
              return (
                <li key={r.id} data-retainer={r.concept}>
                  <Card className={cn("flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-5", r.status !== "active" && "opacity-70")}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-[15px] font-medium text-text">{r.concept}</h3>
                        {r.status !== "active" ? <Badge tone={r.status === "paused" ? "warning" : "neutral"}>{label(L.retainerStatus, r.status)}</Badge> : null}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-text-muted">
                        <Link href={`/crm/clientes/${r.clientId}`} className="hover:text-text">
                          {clientName}
                        </Link>
                        {projectName ? ` · ${projectName}` : ""}
                      </p>
                      {inc ? (
                        <div className="mt-2 max-w-sm">
                          <p className={cn("mb-1 flex justify-between font-mono text-[11px]", over ? "text-warning" : "text-text-muted")}>
                            <span>Horas del mes</span>
                            <span>
                              {fmtH(minutesUsed ?? 0)} / {fmtH(inc)}
                              {over ? " · excedido" : ""}
                            </span>
                          </p>
                          <Progress value={pct} tone={over ? "warning" : "gradient"} label={`Horas usadas de ${r.concept}`} />
                        </div>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:flex md:items-center md:gap-6">
                      <div>
                        <p className="font-mono text-[15px] tabular-nums text-text">{formatMoney(r.amount, r.currency)}</p>
                        <p className="text-[12px] text-text-muted">por mes · día {r.billingDay}</p>
                      </div>
                      <div className="text-right md:w-44 md:text-left">
                        <p className="flex items-center gap-1.5 text-[13px] text-text-muted md:justify-start">
                          <CalendarClock className="size-3.5" />
                          {r.status === "active" ? (d <= 0 ? "se genera hoy" : `próximo cobro ${formatDate(r.nextIssueDate)}`) : "sin cobros"}
                        </p>
                        {r.endDate ? <p className="font-mono text-[11px] text-text-faint">hasta {formatDate(r.endDate)}</p> : null}
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <RetainerMenu
                        clients={clients}
                        projects={projects}
                        r={{
                          id: r.id,
                          clientId: r.clientId,
                          projectId: r.projectId,
                          concept: r.concept,
                          amount: r.amount,
                          currency: r.currency,
                          hoursIncluded: r.hoursIncluded,
                          billingDay: r.billingDay,
                          dueDays: r.dueDays,
                          startDate: r.startDate,
                          endDate: r.endDate,
                          notesMd: r.notesMd,
                          status: r.status,
                        }}
                      />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <Card>
          <EmptyState
            icon={<Repeat2 />}
            title="Sin abonos mensuales"
            description="Cargá lo que tus clientes te pagan todos los meses (mantenimiento, hosting, SEO, community). Cada mes se genera el cobro solo, ves tu ingreso recurrente y, si incluye horas, cuántas usaste."
            action={<NewRetainerButton clients={clients} projects={projects} label="Crear el primero" variant="primary" />}
          />
        </Card>
      )}
    </div>
  );
}
