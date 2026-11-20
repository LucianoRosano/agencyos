import "server-only";
import { type Ctx, can, cmpMoney, formatDate, formatMoney, todayAR } from "@agencyos/core";
import { formatMinutes, hoursLabel } from "@agencyos/modules/time/duration";
import { listTimeEntries, type ProjectBudget, projectBudget, projectProfitability, targetRate, timeSummary } from "@agencyos/modules/time/queries";
import { BlockCard, Card, cn, EmptyState, Progress, SectionLabel } from "@agencyos/ui";
import { CalendarRange, Gauge, Scale, Timer } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { RegisterTimeButton, TimeEntryList, type TimeRow } from "./time-ui";

type Entries = Awaited<ReturnType<typeof listTimeEntries>>;

export function toRows(entries: Entries): TimeRow[] {
  return entries.map(({ e, taskTitle, userName }) => ({
    id: e.id,
    date: e.date,
    dateLabel: formatDate(e.date),
    minutes: e.minutes,
    durationLabel: formatMinutes(e.minutes),
    billable: e.billable,
    rate: e.rate,
    rateLabel: e.rate ? `${formatMoney(e.rate, e.currency)}/h` : null,
    currency: e.currency,
    note: e.note,
    projectId: e.projectId,
    taskId: e.taskId,
    taskTitle,
    userName,
  }));
}

/** Pestaña «Horas» de la ficha de proyecto: total, rentabilidad, semanas y registros. */
export async function ProjectHoursTab({ ctx, projectId }: { ctx: Ctx & { workspace?: { settings: unknown } }; projectId: string }) {
  const today = todayAR();
  const [profit, entries, budget] = await Promise.all([
    projectProfitability(ctx, projectId),
    listTimeEntries(ctx, { projectId }),
    can(ctx, "read", "finance") ? projectBudget(ctx, projectId) : Promise.resolve(null),
  ]);
  const target = targetRate(ctx);
  const maxWeek = Math.max(1, ...profit.weeks.map((w) => w.minutes));
  const register = <RegisterTimeButton fixed={{ projectId }} today={today} />;

  if (!profit.entries) {
    return (
      <Card className="p-2">
        <EmptyState
          icon={<Timer />}
          title="Sin horas registradas"
          description="Registrá el tiempo que le dedicás (o usá el Modo foco sobre sus tareas) y vas a ver la tarifa efectiva por hora del proyecto."
          action={register}
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionLabel icon={<Timer />}>Registros</SectionLabel>
          {register}
        </div>
        <TimeEntryList rows={toRows(entries)} today={today} />
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        {budget ? <BudgetBlock b={budget} /> : null}
        <BlockCard icon={<Gauge />} title="Rentabilidad">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[14px]">
            <dt className="text-text-muted">Horas</dt>
            <dd className="text-right font-mono text-text">{hoursLabel(profit.minutes)} h</dd>
            <dt className="text-text-muted">Facturables</dt>
            <dd className="text-right font-mono text-text-muted">{hoursLabel(profit.billableMinutes)} h</dd>
            {profit.rates.length ? (
              profit.rates.map((r) => <RateLines key={r.currency} currency={r.currency} income={r.income} rate={r.rate} target={target} />)
            ) : (
              <dd className="col-span-2 text-[13px] text-text-faint">
                Sin cobros asignados a este proyecto. Cuando registres un ingreso con este proyecto, se calcula la tarifa efectiva.
              </dd>
            )}
          </dl>
        </BlockCard>
        <BlockCard icon={<CalendarRange />} title="Por semana">
          <ul className="flex flex-col gap-2.5">
            {profit.weeks.map((w) => (
              <li key={w.week} className="flex items-center gap-3 text-[13px]">
                <span className="w-[88px] shrink-0 font-mono text-text-muted">{formatDate(w.week)}</span>
                <Progress value={(w.minutes / maxWeek) * 100} className="flex-1" />
                <span className="w-[72px] shrink-0 text-right font-mono text-text">{formatMinutes(w.minutes)}</span>
              </li>
            ))}
          </ul>
        </BlockCard>
      </div>
    </div>
  );
}

function RateLines({
  currency,
  income,
  rate,
  target,
}: {
  currency: string;
  income: string;
  rate: string | null;
  target: { amount: string; currency: string } | null;
}) {
  const vs = target && rate && target.currency === currency ? cmpMoney(rate, target.amount) : null;
  return (
    <>
      <dt className="text-text-muted">Cobrado {currency}</dt>
      <dd className="text-right font-mono text-text">{formatMoney(income, currency)}</dd>
      <dt className="text-text-muted">Tarifa efectiva</dt>
      <dd className="text-right font-mono">
        <span className={vs === null ? "text-text" : vs >= 0 ? "text-success" : "text-warning"}>{rate ? `${formatMoney(rate, currency)}/h` : "—"}</span>
        {vs !== null && target ? <span className="block text-[12px] text-text-faint">objetivo {formatMoney(target.amount, target.currency)}/h</span> : null}
      </dd>
    </>
  );
}

/** Línea compacta para el Resumen del proyecto. */
/** Presupuesto vs. real: lo que cubre el presupuesto a tu tarifa objetivo, lo estimado y lo registrado. */
function BudgetBlock({ b }: { b: ProjectBudget }) {
  const ref = b.coveredMinutes ?? (b.estimateMinutes || null);
  const pct = ref ? Math.round((b.loggedMinutes / ref) * 100) : null;
  return (
    <BlockCard icon={<Scale />} title="Presupuesto vs. real">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[14px]" data-testid="project-budget">
        {b.quote ? (
          <>
            <dt className="text-text-muted">Presupuesto</dt>
            <dd className="text-right">
              <Link href={`/presupuestos/${b.quote.id}`} className="font-mono text-text hover:underline">
                {formatMoney(b.quote.total, b.quote.currency)}
              </Link>
              <span className="block text-[12px] text-text-muted">{b.quote.number}</span>
            </dd>
            <dt className="text-text-muted">Cubre</dt>
            <dd className="text-right font-mono text-text">
              {b.coveredMinutes !== null ? `${hoursLabel(b.coveredMinutes)} h` : <span className="text-[12px] text-text-muted">cargá tu tarifa objetivo</span>}
            </dd>
          </>
        ) : null}
        <dt className="text-text-muted">Estimado</dt>
        <dd className="text-right font-mono text-text-muted">
          {b.estimateMinutes ? `${hoursLabel(b.estimateMinutes)} h` : "—"}
          {b.unestimatedTasks ? <span className="block font-sans text-[12px]">{b.unestimatedTasks} tareas sin estimar</span> : null}
        </dd>
        <dt className="text-text-muted">Registrado</dt>
        <dd className={cn("text-right font-mono", b.over ? "text-warning" : "text-text")}>
          {hoursLabel(b.loggedMinutes)} h{pct !== null ? ` · ${pct}%` : ""}
        </dd>
        {b.expenses.map((e) => (
          <Fragment key={e.currency}>
            <dt className="text-text-muted">Gastos {e.currency}</dt>
            <dd className="text-right font-mono text-text-muted">{formatMoney(e.total, e.currency)}</dd>
          </Fragment>
        ))}
        {b.realRate && b.quote ? (
          <>
            <dt className="text-text-muted">Tarifa real hoy</dt>
            <dd className="text-right font-mono text-text">{formatMoney(b.realRate, b.quote.currency)}/h</dd>
          </>
        ) : null}
      </dl>
      {ref ? (
        <Progress
          value={Math.min(100, pct ?? 0)}
          className="mt-3"
          tone={b.over ? "warning" : undefined}
          label={`Horas registradas: ${pct ?? 0}% de lo presupuestado`}
        />
      ) : null}
      {b.over ? (
        <p className="mt-2 text-[13px] text-warning">
          {b.over === "budget"
            ? `Ya registraste ${hoursLabel(b.loggedMinutes - (b.coveredMinutes ?? 0))} h más de las que cubre el presupuesto a tu tarifa objetivo.`
            : `Ya registraste ${hoursLabel(b.loggedMinutes - b.estimateMinutes)} h más de lo estimado en las tareas.`}
        </p>
      ) : !b.quote ? (
        <p className="mt-2 text-[13px] text-text-muted">Vinculá el presupuesto aceptado al proyecto para comparar contra lo cobrado.</p>
      ) : null}
    </BlockCard>
  );
}

export async function projectHoursLine(ctx: Ctx, projectId: string) {
  const s = await timeSummary(ctx, { projectId });
  return s.entries ? `${hoursLabel(s.minutes)} h` : null;
}

/** Bloque «Tiempo» de la ficha de tarea. */
export async function TaskTimeBlock({ ctx, taskId, projectId }: { ctx: Ctx; taskId: string; projectId: string | null }) {
  const today = todayAR();
  const [summary, entries] = await Promise.all([timeSummary(ctx, { taskId }), listTimeEntries(ctx, { taskId, limit: 50 })]);
  const withRate = can(ctx, "update", "time_rate");
  return (
    <BlockCard
      icon={<Timer />}
      title={summary.entries ? `Tiempo · ${formatMinutes(summary.minutes)}` : "Tiempo"}
      action={<RegisterTimeButton fixed={{ taskId, projectId }} today={today} variant="ghost" label="Registrar" withRate={withRate} />}
    >
      {entries.length ? (
        <TimeEntryList rows={toRows(entries)} today={today} showTask={false} withRate={withRate} />
      ) : (
        <p className="text-[13px] text-text-faint">Sin tiempo registrado. Usá el Modo foco o registralo a mano.</p>
      )}
    </BlockCard>
  );
}
