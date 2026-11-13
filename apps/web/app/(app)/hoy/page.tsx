import { dowName, formatTime, greeting, monthShort, todayAR } from "@agencyos/core";
import { listTasks } from "@agencyos/modules/tasks/queries";
import { getToday } from "@agencyos/modules/today/queries";
import { getTodayLayout, type TodayBlock } from "@agencyos/modules/today/service";
import { Pill } from "@agencyos/ui";
import { AgendaBlock, MoneyBlock, NotesBlock, ProjectsBlock, StudyBlock } from "@/components/today/blocks";
import { CatchUpBlock } from "@/components/today/catchup-block";
import { CustomizeToday } from "@/components/today/customize";
import { FocusBlock } from "@/components/today/focus-block";
import { getSelectedSpace } from "@/lib/prefs";
import { firstName, requireCtx } from "@/lib/session";

export const metadata = { title: "Hoy" };

export default async function HoyPage() {
  const ctx = await requireCtx();
  const spaceId = await getSelectedSpace();
  const now = new Date();
  const [data, layout, candidates] = await Promise.all([
    getToday(ctx, { spaceId, userId: ctx.user.id, now }),
    getTodayLayout(ctx.user.id),
    listTasks(ctx, { view: "hoy", spaceId, limit: 40 }),
  ]);
  const today = todayAR(now);
  const [y, m, d] = today.split("-");
  const { counts, week } = data;
  const pct = week.total ? Math.round((week.done / week.total) * 100) : 0;

  const blocks: Record<TodayBlock, React.ReactNode> = {
    foco: <FocusBlock items={data.focus} candidates={candidates.map((r) => ({ ...r.t, projectName: r.projectName, clientName: r.clientName }))} />,
    ponerse: <CatchUpBlock items={data.catchUp} />,
    proximos: <AgendaBlock items={data.agenda} today={today} />,
    dinero: <MoneyBlock m={data.money} />,
    facultad: data.study ? <StudyBlock s={data.study} today={today} /> : null,
    notas: ctx.workspace.enabledModules.includes("notes") ? <NotesBlock notes={data.recentNotes} /> : null,
    proyectos: <ProjectsBlock projects={data.projects} />,
  };
  const visible = layout.order.filter((b) => !layout.hidden.includes(b) && blocks[b]);

  return (
    <div className="mx-auto max-w-[1560px]">
      <header className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-text-muted">
            {dowName(today)} · {Number(d)} {monthShort(Number(m))} {y} <span className="hidden md:inline">· {formatTime(now)}</span>
          </p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-tight md:text-[40px]">
            {greeting(now)}, {firstName(ctx.user.name)}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill color="#7C5CFF" href="/tareas?ver=hoy">
              {counts.forToday} para hoy
            </Pill>
            {counts.overdue ? (
              <Pill color="#F43F5E" href="/tareas?ver=hoy">
                {counts.overdue} {counts.overdue === 1 ? "vencida" : "vencidas"}
              </Pill>
            ) : null}
            {counts.paymentsSoon ? (
              <Pill color="#FBBF24" href="/finanzas">
                {counts.paymentsSoon} {counts.paymentsSoon === 1 ? "pago por vencer" : "pagos por vencer"}
              </Pill>
            ) : null}
            {counts.inbox ? (
              <Pill color="#22D3EE" href="/bandeja">
                {counts.inbox} en la bandeja
              </Pill>
            ) : null}
          </div>
        </div>
        <div className="flex items-end justify-between gap-4 md:flex-col md:items-end">
          <div className="text-left md:text-right">
            <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-text-muted">Semana {week.number}</p>
            <p className="mt-1 font-mono text-[15px] text-text">
              {week.done} de {week.total} tareas · <span className="text-gradient">{pct}%</span>
            </p>
          </div>
          <CustomizeToday layout={layout} />
        </div>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {visible.map((b) => (
          <section key={b} className={`min-w-0 [&>*]:h-full ${b === "proyectos" ? "lg:col-span-2 xl:col-span-3" : ""}`} aria-label={b}>
            {blocks[b]}
          </section>
        ))}
      </div>
    </div>
  );
}
