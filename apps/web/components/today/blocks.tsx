import { dowShort, formatMoney, todayAR } from "@agencyos/core";
import { BarPairs, BlockCard, EmptyState, Progress } from "@agencyos/ui";
import { CalendarDays, FileText, FolderKanban, GraduationCap, Wallet } from "lucide-react";
import Link from "next/link";
import { ProjectCard, type ProjectCardData } from "@/components/project-card";

type Agenda = { key: string; date: string; time?: string | null; title: string; kind: string; color: string; href: string };

const More = ({ href, label }: { href: string; label: string }) => (
  <Link href={href} className="text-[13px] text-text-muted hover:text-text">
    {label} →
  </Link>
);

export function AgendaBlock({ items, today = todayAR() }: { items: Agenda[]; today?: string }) {
  const days = [...new Set(items.map((i) => i.date))];
  return (
    <BlockCard icon={<CalendarDays />} title="Próximos 7 días" action={<More href="/calendario" label="calendario" />}>
      {items.length ? (
        <div className="flex flex-col">
          {days.map((d) => (
            <div key={d} className="grid grid-cols-[64px_1fr] gap-x-3 border-b border-border py-3 last:border-0">
              <span className="pt-0.5 font-mono text-[12px] uppercase text-text-muted">{d === today ? "Hoy" : `${dowShort(d)} ${Number(d.slice(8, 10))}`}</span>
              <ul className="flex flex-col gap-2.5">
                {items
                  .filter((i) => i.date === d)
                  .slice(0, 4)
                  .map((i) => (
                    <li key={i.key}>
                      <Link href={i.href} className="flex items-start gap-3 text-[14px] hover:underline">
                        <span aria-hidden className="mt-0.5 h-4 w-0.5 shrink-0 rounded-full" style={{ background: i.color }} />
                        <span className="flex-1 leading-snug text-text">{i.title}</span>
                        <span className="font-mono text-[12px] text-text-muted">{i.time ?? "—"}</span>
                        <span className="sr-only">{i.kind}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState compact icon={<CalendarDays />} title="Semana despejada" description="No hay tareas, entregas, pagos ni evaluaciones en los próximos 7 días." />
      )}
    </BlockCard>
  );
}

type Money = {
  month: string;
  income: { currency: string; total: string }[];
  expense: { currency: string; total: string }[];
  receivable: { currency: string; total: string; n: number }[];
  payable: { currency: string; total: string; n: number; next: string | null }[];
  activeSubscriptions: number;
  series: { label: string; income: number; expense: number }[];
  hasData: boolean;
};

const MONTH = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

function Amounts({ list, empty = "$ 0", tone = "text-text" }: { list: { currency: string; total: string }[]; empty?: string; tone?: string }) {
  if (!list.length) return <p className={`font-mono text-[22px] ${tone}`}>{empty}</p>;
  return (
    <div>
      {list.map((x) => (
        <p key={x.currency} className={`font-mono text-[22px] leading-tight tabular-nums ${tone}`}>
          {formatMoney(x.total, x.currency)}
        </p>
      ))}
    </div>
  );
}

export function MoneyBlock({ m }: { m: Money }) {
  const title = `Dinero · ${MONTH[Number(m.month.slice(5, 7)) - 1]?.toLowerCase() ?? ""}`;
  return (
    <BlockCard icon={<Wallet />} title={title} action={<More href="/finanzas" label="finanzas" />}>
      {m.hasData ? (
        <>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <div>
              <p className="text-[13px] text-text-muted">Ingresos</p>
              <Amounts list={m.income} />
            </div>
            <div>
              <p className="text-[13px] text-text-muted">Gastos del mes</p>
              <Amounts list={m.expense} />
              {m.activeSubscriptions ? <p className="text-[12px] text-text-faint">{m.activeSubscriptions} suscripciones</p> : null}
            </div>
            <div>
              <p className="text-[13px] text-text-muted">Por cobrar</p>
              <Amounts list={m.receivable} tone="text-success" />
            </div>
            <div>
              <p className="text-[13px] text-text-muted">Por pagar</p>
              <Amounts list={m.payable} tone="text-warning" />
            </div>
          </div>
          {m.series.some((s) => s.income || s.expense) ? (
            <div className="mt-5 border-t border-border pt-4">
              <BarPairs data={m.series.map((s) => ({ label: s.label, a: s.income, b: s.expense }))} />
              <p className="mt-1 text-[11px] text-text-faint">Ingresos vs. gastos en ARS · 6 meses</p>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState compact icon={<Wallet />} title="Sin movimientos todavía" description="Registrá tu primer ingreso o gasto para ver el mes." action={<Link className="text-[13px] text-accent hover:underline" href="/finanzas/movimientos?nuevo=1">Registrar movimiento</Link>} />
      )}
    </BlockCard>
  );
}

type Study = {
  next: { title: string; courseName: string; date: string; time: string | null; targetGrade: string | null; courseId: string } | null;
  upcoming: { title: string; date: string }[];
  courses: { id: string; name: string; progress: number; color: string | null }[];
};

export function StudyBlock({ s, today = todayAR() }: { s: Study; today?: string }) {
  const days = s.next ? Math.round((Date.parse(s.next.date) - Date.parse(today)) / 86_400_000) : null;
  return (
    <BlockCard icon={<GraduationCap />} title="Facultad" action={<More href="/facultad" label="facultad" />}>
      {s.next ? (
        <Link href={`/facultad/${s.next.courseId}`} className="flex items-center gap-5">
          <span className="flex items-baseline gap-1.5">
            <span className="font-mono text-[56px] leading-none text-warning tabular-nums">{days}</span>
            <span className="text-[18px] text-text-muted">{days === 1 ? "día" : "días"}</span>
          </span>
          <span className="min-w-0">
            <span className="block text-[16px] text-text">{s.next.title} · {s.next.courseName}</span>
            <span className="block text-[13px] text-text-muted">
              {s.next.date.slice(8, 10)}/{s.next.date.slice(5, 7)}
              {s.next.time ? ` · ${s.next.time}` : ""}
              {s.next.targetGrade ? ` · objetivo ${Number(s.next.targetGrade)}` : ""}
            </span>
          </span>
        </Link>
      ) : (
        <p className="text-[14px] text-text-muted">Sin evaluaciones próximas.</p>
      )}
      {s.upcoming.length ? (
        <ul className="mt-4 border-t border-border pt-3">
          {s.upcoming.map((u) => (
            <li key={u.title + u.date} className="flex justify-between py-1 text-[13px]">
              <span className="text-text-muted">{u.title}</span>
              <span className="font-mono text-text">en {Math.round((Date.parse(u.date) - Date.parse(today)) / 86_400_000)} días</span>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="mt-4 flex flex-col gap-2.5">
        {s.courses.map((c) => (
          <li key={c.id} className="grid grid-cols-[1fr_120px_40px] items-center gap-3 text-[14px]">
            <Link href={`/facultad/${c.id}`} className="truncate text-text hover:underline">{c.name}</Link>
            <Progress value={c.progress} tone="warning" label={`Avance de ${c.name}`} />
            <span className="text-right font-mono text-[13px] text-text-muted">{c.progress}%</span>
          </li>
        ))}
      </ul>
    </BlockCard>
  );
}

export function NotesBlock({ notes }: { notes: { id: string; title: string; updatedAt: Date; links: number }[] }) {
  return (
    <BlockCard icon={<FileText />} title="Notas recientes" action={<More href="/cerebro" label="cerebro" />}>
      {notes.length ? (
        <>
          <ul className="flex flex-col">
            {notes.map((n) => (
              <li key={n.id} className="border-b border-border last:border-0">
                <Link href={`/notas/${n.id}`} className="flex items-center gap-3 py-2.5 text-[14px] hover:underline">
                  <span aria-hidden className="size-2 rounded-full bg-[#C9D1E0]" />
                  <span className="flex-1 truncate text-text">{n.title}</span>
                  <span className="font-mono text-[12px] text-text-muted">{n.links ? `${n.links} enlaces` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
          <MiniBrain notes={notes} />
        </>
      ) : (
        <EmptyState compact icon={<FileText />} title="Sin notas todavía" description="Las notas en Markdown con [[enlaces]] alimentan el Cerebro." action={<Link className="text-[13px] text-accent hover:underline" href="/notas/nueva">Nueva nota</Link>} />
      )}
    </BlockCard>
  );
}

/** Mini-Cerebro: constelación de las notas recientes (tamaño = enlaces). Datos reales. */
function MiniBrain({ notes }: { notes: { id: string; title: string; links: number }[] }) {
  const pts = notes.map((n, i) => ({ ...n, x: 30 + i * (340 / Math.max(1, notes.length - 1 || 1)), y: 40 + (i % 2 ? 22 : -14) }));
  return (
    <Link href="/cerebro" aria-label="Abrir el Cerebro" className="mt-3 block">
      <svg viewBox="0 0 400 80" className="w-full" aria-hidden>
        {pts.slice(1).map((p, i) => (
          <line key={p.id} x1={pts[i]?.x} y1={pts[i]?.y} x2={p.x} y2={p.y} stroke="var(--border-strong)" strokeWidth={1} />
        ))}
        {pts.map((p, i) => (
          <circle key={p.id} cx={p.x} cy={p.y} r={4 + Math.min(6, p.links)} fill="#C9D1E0" opacity={0.5 + Math.min(0.5, p.links / 10)} />
        ))}
      </svg>
    </Link>
  );
}

export function ProjectsBlock({ projects }: { projects: ProjectCardData[] }) {
  return (
    <BlockCard icon={<FolderKanban />} title="Proyectos activos" action={<More href="/proyectos" label={`ver los ${projects.length}`} />}>
      {projects.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {projects.slice(0, 8).map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <EmptyState compact icon={<FolderKanban />} title="No hay proyectos activos" description="Arrancá uno con el asistente en menos de 2 minutos." action={<Link className="text-[13px] text-accent hover:underline" href="/proyectos/nuevo">Nuevo proyecto</Link>} />
      )}
    </BlockCard>
  );
}
