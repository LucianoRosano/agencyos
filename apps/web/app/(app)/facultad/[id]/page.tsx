import { dowShort, formatDate, formatDayMonth, L, label, relativeFromDate, todayAR } from "@agencyos/core";
import { listActivity } from "@agencyos/modules/activity/queries";
import { getCourse, isTaken } from "@agencyos/modules/study/queries";
import { topicsFromMarkdown } from "@agencyos/modules/study/service";
import { Badge, Button, Card, Dot, EmptyState, PageHeader, Progress, SectionLabel } from "@agencyos/ui";
import { CalendarClock, Clock, FileText, NotebookPen, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityList } from "@/components/activity-list";
import { MarkdownView } from "@/components/markdown";
import { AssessmentActions, CourseMenu, NewAssessmentSheet, StudyPlanSheet } from "@/components/study/assessment-ui";
import { Countdown } from "@/components/study/countdown";
import { CourseSheet } from "@/components/study/course-form";
import { countdownLabel, dayName, formatGrade } from "@/components/study/shared";
import { TaskRow } from "@/components/tasks/task-row";
import { renderMarkdown } from "@/lib/markdown";
import { requireCtx } from "@/lib/session";

const ACCENT = "#FBBF24";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const c = await getCourse(ctx, (await params).id);
  return { title: c?.c.name ?? "Materia" };
}

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const data = await getCourse(ctx, id);
  if (!data) notFound();
  const { c, stats } = data;
  const today = todayAR();
  const color = c.color ?? ACCENT;
  const schedule = [...c.schedule].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7) || a.from.localeCompare(b.from));
  const activity = await listActivity(ctx, { entityType: "course", entityId: id, limit: 30 });
  const nameOf = (a: { title: string | null; kind: string }) => a.title?.trim() || label(L.assessmentKind, a.kind);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/facultad" className="hover:text-text">
              Facultad
            </Link>
            <span aria-hidden>·</span>
            <span>{label(L.courseStatus, c.status)}</span>
            {c.term ? (
              <>
                <span aria-hidden>·</span>
                <span>{c.term}</span>
              </>
            ) : null}
          </span>
        }
        title={
          <span className="flex items-center gap-3">
            <Dot color={color} className="size-3" />
            {c.name}
          </span>
        }
        description={[c.program, c.commission ? `Comisión ${c.commission}` : null].filter(Boolean).join(" · ") || undefined}
        accent={ACCENT}
        actions={
          <>
            <CourseSheet
              id={c.id}
              defaults={{
                name: c.name,
                program: c.program,
                term: c.term,
                commission: c.commission,
                teachers: c.teachers,
                status: c.status,
                finalGrade: c.finalGrade,
                color: c.color,
                notesMd: c.notesMd,
                schedule: c.schedule,
              }}
              trigger={
                <Button variant="secondary">
                  <Pencil className="size-4" /> Editar
                </Button>
              }
            />
            <CourseMenu id={c.id} name={c.name} status={c.status} />
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          {stats.next ? (
            <Card className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:p-5">
              <Countdown date={stats.next.date} today={today} />
              <div className="min-w-0 flex-1">
                <SectionLabel className="mb-1">Próxima evaluación</SectionLabel>
                <p className="text-[17px] font-medium text-text">{nameOf(stats.next)}</p>
                <p className="font-mono text-[13px] text-text-muted">
                  {dowShort(stats.next.date)} {formatDayMonth(stats.next.date)}
                  {stats.next.time ? ` · ${stats.next.time.slice(0, 5)}` : ""}
                  {stats.next.targetGrade ? ` · objetivo ${formatGrade(stats.next.targetGrade)}` : ""}
                  {` · ${topicsFromMarkdown(stats.next.topicsMd).length} temas`}
                </p>
              </div>
              {stats.next.date > today ? (
                // Siempre montado (aunque ya haya plan) para que el formulario no se desmonte al revalidar.
                <StudyPlanSheet
                  a={stats.next}
                  name={nameOf(stats.next)}
                  topics={topicsFromMarkdown(stats.next.topicsMd)}
                  trigger={
                    <Button variant="secondary">
                      <CalendarClock className="size-4" /> {data.plan.get(stats.next.id)?.length ? "Sumar al plan" : "Armar plan de estudio"}
                    </Button>
                  }
                />
              ) : null}
            </Card>
          ) : null}

          <Card className="p-4 md:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SectionLabel icon={<CalendarClock />}>Evaluaciones</SectionLabel>
              <NewAssessmentSheet courseId={c.id} />
            </div>
            {data.assessments.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {data.assessments.map((a) => {
                  const taken = isTaken(a, today);
                  const plan = data.plan.get(a.id) ?? [];
                  const planDone = plan.filter((t) => t.status === "done").length;
                  const topics = topicsFromMarkdown(a.topicsMd);
                  return (
                    <li key={a.id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge>{label(L.assessmentKind, a.kind)}</Badge>
                            <p className="text-[15px] font-medium text-text">{nameOf(a)}</p>
                          </div>
                          <p className="mt-1 font-mono text-[13px] text-text-muted">
                            {formatDate(a.date)}
                            {a.time ? ` · ${a.time.slice(0, 5)}` : ""}
                            {" · "}
                            <span className={a.grade === null && !taken ? "text-warning" : undefined}>
                              {a.grade !== null ? "rendida" : countdownLabel(a.date, today)}
                            </span>
                          </p>
                          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-text-muted">
                            <span>
                              Objetivo <span className="font-mono text-text">{formatGrade(a.targetGrade)}</span>
                            </span>
                            <span>
                              Nota{" "}
                              <span
                                className={
                                  a.grade !== null && a.targetGrade !== null && Number(a.grade) < Number(a.targetGrade)
                                    ? "font-mono text-danger"
                                    : a.grade !== null
                                      ? "font-mono text-success"
                                      : "font-mono text-text-faint"
                                }
                              >
                                {formatGrade(a.grade)}
                              </span>
                            </span>
                            {topics.length ? (
                              <span>
                                {topics.length} {topics.length === 1 ? "tema" : "temas"}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <AssessmentActions a={a} name={nameOf(a)} canPlan={a.date > today} topics={topics} />
                      </div>
                      {a.topicsMd ? (
                        <details className="mt-2">
                          <summary className="flex min-h-9 cursor-pointer items-center font-mono text-[11px] uppercase tracking-[0.16em] text-text-faint">
                            Temas
                          </summary>
                          <MarkdownView html={renderMarkdown(a.topicsMd)} className="mt-1 text-[14px]" />
                        </details>
                      ) : null}
                      {plan.length ? (
                        <details className="mt-2" open={a.date >= today && planDone < plan.length}>
                          <summary className="flex min-h-9 cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-text-faint">
                            Plan de estudio · {planDone}/{plan.length}
                          </summary>
                          <ul className="mt-1 overflow-hidden rounded-[var(--radius-card)] border border-border">
                            {plan.map((t) => (
                              <TaskRow key={t.id} task={t} showProject={false} />
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={<CalendarClock />}
                title="Sin evaluaciones"
                description="Agendá parciales, TPs, finales y recuperatorios con su fecha, temas y la nota que buscás."
              />
            )}
          </Card>

          <Card className="p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <SectionLabel icon={<NotebookPen />}>Apuntes</SectionLabel>
              <Button asChild variant="secondary">
                <Link href={`/notas/nueva?materia=${c.id}`}>
                  <Plus className="size-4" /> Nueva nota
                </Link>
              </Button>
            </div>
            {data.notes.length ? (
              <ul className="flex flex-col">
                {data.notes.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/notas/${n.id}`}
                      className="flex min-h-11 items-center justify-between gap-3 border-b border-border text-[14px] text-text last:border-0 hover:text-accent-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FileText className="size-4 shrink-0 text-text-muted" />
                        <span className="truncate">{n.title}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[12px] text-text-faint">{relativeFromDate(n.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-text-faint">Sin apuntes vinculados. Las notas que crees desde acá quedan asociadas a la materia.</p>
            )}
          </Card>

          <Card className="p-4 md:p-5">
            <SectionLabel className="mb-3">Notas de la materia</SectionLabel>
            <MarkdownView
              html={renderMarkdown(c.notesMd)}
              empty="Sin notas. Editá la materia para agregar bibliografía, criterios de aprobación o links (Markdown)."
            />
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="p-4 md:p-5">
            <SectionLabel className="mb-4">Propiedades</SectionLabel>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[14px]">
              <dt className="text-text-muted">Avance</dt>
              <dd>
                <span className="font-mono text-warning">{stats.progress}%</span>
                <span className="ml-2 font-mono text-[12px] text-text-faint">
                  {stats.taken}/{stats.total} rendidas
                </span>
                <Progress value={stats.progress} tone="warning" className="mt-1.5" label="Avance de la materia" />
              </dd>
              <dt className="text-text-muted">Estado</dt>
              <dd>
                <Badge tone={c.status === "aprobada" ? "success" : c.status === "final_pendiente" ? "warning" : "neutral"}>
                  {label(L.courseStatus, c.status)}
                </Badge>
              </dd>
              <dt className="text-text-muted">Promedio</dt>
              <dd className="font-mono">{formatGrade(stats.average)}</dd>
              <dt className="text-text-muted">Nota final</dt>
              <dd className="font-mono">{formatGrade(c.finalGrade)}</dd>
              <dt className="text-text-muted">Carrera</dt>
              <dd className="min-w-0 break-words">{c.program ?? "—"}</dd>
              <dt className="text-text-muted">Cuatrimestre</dt>
              <dd>{c.term ?? "—"}</dd>
              <dt className="text-text-muted">Comisión</dt>
              <dd>{c.commission ?? "—"}</dd>
              <dt className="text-text-muted">Docentes</dt>
              <dd className="min-w-0 break-words">{c.teachers ?? "—"}</dd>
              <dt className="text-text-muted">Espacio</dt>
              <dd>{data.spaceName ?? "—"}</dd>
            </dl>
          </Card>

          <Card className="p-4 md:p-5">
            <SectionLabel icon={<Clock />} className="mb-3">
              Horarios
            </SectionLabel>
            {schedule.length ? (
              <ul className="flex flex-col gap-2">
                {schedule.map((s, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: los horarios no tienen id
                  <li key={i} className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="text-text">{dayName(s.day)}</span>
                    <span className="text-right font-mono text-[13px] text-text-muted">
                      {s.from}–{s.to}
                      {s.room ? ` · ${s.room}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-text-faint">Sin horarios. Editá la materia para cargarlos.</p>
            )}
          </Card>

          <Card className="p-4 md:p-5">
            <SectionLabel className="mb-3">Actividad</SectionLabel>
            <ActivityList rows={activity} />
          </Card>
        </div>
      </div>
    </div>
  );
}
