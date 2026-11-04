import { dowShort, formatDayMonth, L, label } from "@agencyos/core";
import { type CourseListItem, listCourses, studyOverview } from "@agencyos/modules/study/queries";
import { Badge, Button, Card, cn, Dot, EmptyState, PageHeader, Progress, SectionLabel, Tabs } from "@agencyos/ui";
import { CalendarClock, GraduationCap, Plus } from "lucide-react";
import Link from "next/link";
import { Countdown } from "@/components/study/countdown";
import { CourseSheet } from "@/components/study/course-form";
import { countdownLabel, formatGrade } from "@/components/study/shared";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Facultad" };

const FILTERS = [
  { key: "activas", label: "Activas" },
  { key: "aprobada", label: "Aprobadas" },
  { key: "abandonada", label: "Abandonadas" },
  { key: "todas", label: "Todas" },
];

const ACCENT = "#FBBF24";

export default async function FacultadPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const filter = FILTERS.find((f) => f.key === sp.estado)?.key ?? "activas";
  // Facultad no aplica el selector global de espacio: las materias viven en el espacio Facultad.
  const [all, overview] = await Promise.all([listCourses(ctx, { includeAll: true }), studyOverview(ctx)]);
  const rows =
    filter === "todas"
      ? all
      : filter === "activas"
        ? all.filter((c) => ["cursando", "regular", "final_pendiente"].includes(c.status))
        : all.filter((c) => c.status === filter);
  const newButton = (
    <CourseSheet
      trigger={
        <Button variant="primary">
          <Plus className="size-4" /> Nueva materia
        </Button>
      }
    />
  );

  if (!all.length) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader eyebrow="Facultad" title="Facultad" accent={ACCENT} />
        <Card className="px-4">
          <EmptyState
            icon={<GraduationCap />}
            title="Todavía no cargaste materias"
            description="Agregá las materias que estás cursando con sus horarios y evaluaciones: vas a ver la cuenta regresiva al próximo parcial acá, en Hoy y en el calendario."
            action={newButton}
          />
        </Card>
      </div>
    );
  }

  const next = overview.upcoming[0];
  const active = all.filter((c) => ["cursando", "regular", "final_pendiente"].includes(c.status));
  const taken = all.reduce((n, c) => n + c.stats.taken, 0);
  const total = all.reduce((n, c) => n + c.stats.total, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Facultad" title="Facultad" accent={ACCENT} actions={newButton} />

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="flex flex-col p-4 md:p-5">
          <SectionLabel icon={<GraduationCap />} className="mb-4">
            Próxima evaluación
          </SectionLabel>
          {next ? (
            <>
              <Link href={`/facultad/${next.a.courseId}`} className="group flex items-center gap-5 rounded-[var(--radius-control)]">
                <Countdown date={next.a.date} />
                <div className="min-w-0">
                  <p className="text-[17px] font-medium text-text group-hover:underline">
                    {next.a.title?.trim() || label(L.assessmentKind, next.a.kind)} · {next.courseName}
                  </p>
                  <p className="mt-1 font-mono text-[13px] text-text-muted">
                    {dowShort(next.a.date)} {formatDayMonth(next.a.date)}
                    {next.a.time ? ` · ${next.a.time.slice(0, 5)}` : ""}
                    {next.a.targetGrade ? ` · objetivo ${formatGrade(next.a.targetGrade)}` : ""}
                  </p>
                  <Badge className="mt-2">{label(L.assessmentKind, next.a.kind)}</Badge>
                </div>
              </Link>
              {overview.upcoming.length > 1 ? (
                <ul className="mt-5 flex flex-col border-t border-border pt-3">
                  {overview.upcoming.slice(1, 5).map((u) => (
                    <li key={u.a.id}>
                      <Link
                        href={`/facultad/${u.a.courseId}`}
                        className="flex min-h-11 items-center justify-between gap-3 text-[14px] text-text-muted hover:text-text"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Dot color={u.courseColor ?? ACCENT} />
                          <span className="truncate">
                            {u.courseName} · {u.a.title?.trim() || label(L.assessmentKind, u.a.kind)}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[13px] text-text">{countdownLabel(u.a.date, overview.today)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <EmptyState
              compact
              icon={<CalendarClock />}
              title="Sin evaluaciones próximas"
              description="Agendá parciales, TPs y finales desde la ficha de cada materia."
            />
          )}
        </Card>

        <Card className="flex flex-col p-4 md:p-5">
          <SectionLabel className="mb-4">Avance por materia</SectionLabel>
          <dl className="mb-4 grid grid-cols-3 gap-3 border-b border-border pb-4">
            <div>
              <dt className="text-[12px] text-text-muted">Promedio</dt>
              <dd className="font-mono text-[22px] text-text">{overview.average ? formatGrade(overview.average) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-text-muted">Rendidas</dt>
              <dd className="font-mono text-[22px] text-text">
                {taken}
                <span className="text-[14px] text-text-faint">/{total}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-text-muted">Activas</dt>
              <dd className="font-mono text-[22px] text-text">{active.length}</dd>
            </div>
          </dl>
          {active.length ? (
            <ul className="flex flex-col gap-1">
              {active.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/facultad/${c.id}`}
                    className="grid min-h-9 grid-cols-[1fr_96px_40px] items-center gap-3 text-[14px] text-text hover:text-text md:grid-cols-[1fr_120px_44px]"
                  >
                    <span className="truncate">{c.name}</span>
                    <Progress value={c.stats.progress} tone="warning" label={`Avance de ${c.name}`} />
                    <span className="text-right font-mono text-[13px] text-text-muted">{c.stats.progress}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-text-faint">Ninguna materia en curso.</p>
          )}
        </Card>
      </div>

      <Tabs
        active={filter}
        items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: f.key === "activas" ? "/facultad" : `/facultad?estado=${f.key}` }))}
      />
      {rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <CourseCard key={c.id} c={c} today={overview.today} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<GraduationCap />}
          title={`No hay materias ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}`}
          description="Cambiá el filtro para ver el resto."
        />
      )}
    </div>
  );
}

function CourseCard({ c, today }: { c: CourseListItem; today: string }) {
  const color = c.color ?? ACCENT;
  const dim = c.status === "abandonada";
  return (
    <Link
      href={`/facultad/${c.id}`}
      className={cn(
        "group relative flex min-h-44 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-bg-elevated p-4 transition-colors hover:border-border-strong md:p-5",
        dim && "opacity-55",
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-0.5" style={{ background: color }} />
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[16px] font-medium text-text">{c.name}</h3>
        <Badge tone={c.status === "aprobada" ? "success" : c.status === "final_pendiente" ? "warning" : "neutral"} className="shrink-0">
          {label(L.courseStatus, c.status)}
        </Badge>
      </div>
      <p className="mt-1 flex items-center gap-2 text-[13px] text-text-muted">
        <Dot color={color} />
        <span className="truncate">
          {[c.term, c.commission ? `Comisión ${c.commission}` : null].filter(Boolean).join(" · ") || c.program || "Sin cuatrimestre"}
        </span>
      </p>
      <Progress value={c.stats.progress} tone="warning" className="mt-4" label={`Avance de ${c.name}`} />
      <div className="mt-2 flex items-center justify-between font-mono text-[12px] text-text-faint">
        <span>
          {c.stats.taken}/{c.stats.total} rendidas
        </span>
        <span>{c.stats.average ? `prom. ${formatGrade(c.stats.average)}` : c.finalGrade ? `final ${formatGrade(c.finalGrade)}` : `${c.stats.progress}%`}</span>
      </div>
      <p className="mt-auto flex items-center gap-2 pt-4 text-[14px] text-text">
        <CalendarClock className="size-4 shrink-0 text-warning" />
        {c.stats.next ? (
          <span className="truncate">
            {c.stats.next.title?.trim() || label(L.assessmentKind, c.stats.next.kind)}{" "}
            <span className="font-mono text-text-muted">· {countdownLabel(c.stats.next.date, today)}</span>
          </span>
        ) : (
          <span className="text-text-faint">Sin evaluaciones próximas</span>
        )}
      </p>
    </Link>
  );
}
