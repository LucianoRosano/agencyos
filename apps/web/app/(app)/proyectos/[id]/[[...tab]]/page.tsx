import { formatDate, L, label, relativeFromDate, todayAR } from "@agencyos/core";
import { listActivity } from "@agencyos/modules/activity/queries";
import { getProject } from "@agencyos/modules/projects/queries";
import { siteForProject } from "@agencyos/modules/sites/queries";
import { Badge, Button, Card, EmptyState, PageHeader, Progress, SectionLabel, Tabs } from "@agencyos/ui";
import { CornerDownRight, LayoutTemplate, ListChecks } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityList } from "@/components/activity-list";
import { MarkdownView } from "@/components/markdown";
import { TaskBoard } from "@/components/tasks/task-board";
import { NewTaskSheet } from "@/components/tasks/task-form";
import { TaskRow } from "@/components/tasks/task-row";
import { renderMarkdown } from "@/lib/markdown";
import { clientOpts, projectOpts, spaceOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";
import {
  BlockerList,
  ChangelogForm,
  DecisionForm,
  DeliverableForm,
  DeliverableStatus,
  EditProjectSheet,
  NextActionForm,
  PhaseForm,
  PhaseStatus,
  ProjectMenu,
} from "./project-ui";

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "tareas", label: "Tareas" },
  { key: "etapas", label: "Etapas" },
  { key: "entregas", label: "Entregas" },
  { key: "decisiones", label: "Decisiones" },
  { key: "changelog", label: "Changelog" },
  { key: "actividad", label: "Actividad" },
];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const p = await getProject(ctx, (await params).id);
  return { title: p?.p.name ?? "Proyecto" };
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; tab?: string[] }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id, tab: tabParts } = await params;
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === tabParts?.[0])?.key ?? "resumen";
  const ctx = await requireCtx();
  const data = await getProject(ctx, id);
  if (!data) notFound();
  const { p } = data;
  const openTasks = data.tasks.filter((t) => !t.parentTaskId && ["todo", "doing", "waiting"].includes(t.status));
  const doneTasks = data.tasks.filter((t) => !t.parentTaskId && t.status === "done");
  const activeBlockers = data.blockers.filter((b) => !b.resolvedAt);
  const sitesOn = ctx.workspace.enabledModules.includes("sites") && (p.kind === "website" || p.kind === "store");
  const [projects, spaces, clients, site] = await Promise.all([
    projectOpts(ctx),
    spaceOpts(ctx),
    clientOpts(ctx),
    sitesOn ? siteForProject(ctx, p.id) : Promise.resolve(null),
  ]);
  const phaseName = new Map(data.phases.map((ph) => [ph.id, ph.name]));
  const today = todayAR();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            Proyecto · {label(L.projectStatus, p.status)}
            {data.clientName ? (
              <>
                ·{" "}
                <Link href={`/crm/clientes/${p.clientId}`} className="hover:text-text">
                  {data.clientName}
                </Link>
              </>
            ) : (
              <>· {data.spaceName}</>
            )}
          </span>
        }
        title={p.name}
        description={p.goal ?? undefined}
        accent="#7C5CFF"
        actions={
          <>
            {sitesOn ? (
              <Button asChild variant={site ? "ghost" : "primary"}>
                <Link href={site ? `/sitios/${site.id}` : `/sitios/nuevo?proyecto=${p.id}`}>
                  <LayoutTemplate className="size-4" /> {site ? "Ver sitio" : "Crear sitio"}
                </Link>
              </Button>
            ) : null}
            <EditProjectSheet
              id={p.id}
              spaces={spaces}
              clients={clients}
              defaults={{
                name: p.name,
                spaceId: p.spaceId,
                clientId: p.clientId,
                kind: p.kind,
                goal: p.goal,
                definitionOfDone: p.definitionOfDone,
                status: p.status,
                priority: p.priority,
                startDate: p.startDate,
                targetDate: p.targetDate,
                deliveredDate: p.deliveredDate,
                nextAction: p.nextAction,
                notesMd: p.notesMd,
              }}
            />
            <ProjectMenu id={p.id} name={p.name} status={p.status} archived={Boolean(p.archivedAt)} />
          </>
        }
      />
      <Tabs
        active={tab}
        items={TABS.map((t) => ({
          ...t,
          href: `/proyectos/${id}${t.key === "resumen" ? "" : `/${t.key}`}`,
          count: t.key === "tareas" ? openTasks.length : t.key === "decisiones" ? data.decisions.length || undefined : undefined,
        }))}
      />

      {tab === "resumen" ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-5">
            <Card className="p-5">
              <SectionLabel className="mb-3">Siguiente acción</SectionLabel>
              <p className="mb-3 flex items-start gap-2 text-[15px] text-text">
                <CornerDownRight className="mt-0.5 size-4 shrink-0 text-accent" />
                {p.nextAction ?? <span className="text-text-faint">Sin definir. Un proyecto en curso siempre necesita su siguiente acción.</span>}
              </p>
              <NextActionForm id={p.id} />
            </Card>
            {activeBlockers.length ? (
              <Card className="border-warning/40 p-5">
                <SectionLabel className="mb-3">Bloqueos</SectionLabel>
                <BlockerList projectId={p.id} blockers={activeBlockers.map((b) => ({ id: b.id, waitingFor: b.waitingFor, revisitOn: b.revisitOn }))} />
              </Card>
            ) : null}
            <Card className="p-5">
              <SectionLabel className="mb-3">Definición de terminado</SectionLabel>
              <p className="text-[15px] whitespace-pre-wrap text-text">{p.definitionOfDone ?? <span className="text-text-faint">Sin definir.</span>}</p>
            </Card>
            <Card className="p-5">
              <SectionLabel className="mb-3">Notas del proyecto</SectionLabel>
              <MarkdownView html={renderMarkdown(p.notesMd)} empty="Sin notas. Editá el proyecto para agregarlas (Markdown)." />
            </Card>
          </div>
          <div className="flex flex-col gap-5">
            <Card className="p-5">
              <SectionLabel className="mb-4">Propiedades</SectionLabel>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[14px]">
                <dt className="text-text-muted">Avance</dt>
                <dd>
                  <span className="font-mono text-gradient">{p.progress}%</span>
                  <Progress value={p.progress} className="mt-1.5" />
                </dd>
                <dt className="text-text-muted">Estado</dt>
                <dd>
                  <Badge tone={p.status === "in_progress" ? "accent" : p.status === "blocked" ? "warning" : "neutral"}>
                    {label(L.projectStatus, p.status)}
                  </Badge>
                </dd>
                <dt className="text-text-muted">Tipo</dt>
                <dd>{label(L.projectKind, p.kind)}</dd>
                <dt className="text-text-muted">Prioridad</dt>
                <dd>P{p.priority}</dd>
                <dt className="text-text-muted">Inicio</dt>
                <dd className="font-mono">{formatDate(p.startDate)}</dd>
                <dt className="text-text-muted">Objetivo</dt>
                <dd className="font-mono">{formatDate(p.targetDate)}</dd>
                {p.deliveredDate ? (
                  <>
                    <dt className="text-text-muted">Entregado</dt>
                    <dd className="font-mono">{formatDate(p.deliveredDate)}</dd>
                  </>
                ) : null}
                <dt className="text-text-muted">Tareas</dt>
                <dd className="font-mono">
                  {doneTasks.length} / {doneTasks.length + openTasks.length}
                </dd>
                <dt className="text-text-muted">Actividad</dt>
                <dd>{relativeFromDate(p.lastActivityAt)}</dd>
              </dl>
            </Card>
            <Card className="p-5">
              <SectionLabel className="mb-3">Agregar bloqueo</SectionLabel>
              <BlockerList projectId={p.id} blockers={[]} formOnly />
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "tareas" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2 text-[13px]">
              <Link href={`/proyectos/${id}/tareas`} className={sp.vista !== "kanban" ? "text-text" : "text-text-muted"}>
                Lista
              </Link>
              <span className="text-text-faint">·</span>
              <Link href={`/proyectos/${id}/tareas?vista=kanban`} className={sp.vista === "kanban" ? "text-text" : "text-text-muted"}>
                Kanban
              </Link>
            </div>
            <NewTaskSheet
              projects={projects}
              spaces={spaces}
              defaults={{ projectId: p.id, spaceId: p.spaceId, dueDate: today }}
              trigger={
                <button type="button" className="h-10 rounded-[var(--radius-control)] bg-[image:var(--gradient)] px-4 text-sm font-medium text-white">
                  + Nueva tarea
                </button>
              }
            />
          </div>
          {sp.vista === "kanban" ? (
            <TaskBoard
              tasks={data.tasks
                .filter((t) => !t.parentTaskId && t.status !== "cancelled")
                .map((t) => ({ ...t, projectName: phaseName.get(t.phaseId ?? "") ?? null }))}
            />
          ) : openTasks.length || doneTasks.length ? (
            <>
              {[...data.phases.map((ph) => ({ id: ph.id, name: ph.name })), { id: "", name: "Sin etapa" }].map((ph) => {
                const list = openTasks.filter((t) => (t.phaseId ?? "") === ph.id);
                if (!list.length) return null;
                return (
                  <section key={ph.id || "none"}>
                    <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">{ph.name}</h3>
                    <ul className="overflow-hidden rounded-[var(--radius-card)] border border-border">
                      {list.map((t) => (
                        <TaskRow key={t.id} task={t} showProject={false} />
                      ))}
                    </ul>
                  </section>
                );
              })}
              {doneTasks.length ? (
                <details className="mt-2">
                  <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.16em] text-text-faint">
                    Completadas ({doneTasks.length})
                  </summary>
                  <ul className="mt-2 overflow-hidden rounded-[var(--radius-card)] border border-border">
                    {doneTasks.map((t) => (
                      <TaskRow key={t.id} task={t} showProject={false} />
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : (
            <EmptyState icon={<ListChecks />} title="Sin tareas" description="Creá la primera tarea del proyecto." />
          )}
        </div>
      ) : null}

      {tab === "etapas" ? (
        <div className="flex flex-col gap-4">
          {data.phases.length ? (
            <ol className="flex flex-col gap-2">
              {data.phases.map((ph, i) => {
                const pt = data.tasks.filter((t) => t.phaseId === ph.id && !t.parentTaskId && t.status !== "cancelled");
                const pd = pt.filter((t) => t.status === "done").length;
                return (
                  <li key={ph.id}>
                    <Card className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                      <span className="font-mono text-[13px] text-text-faint">{String(i + 1).padStart(2, "0")}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] text-text">{ph.name}</p>
                        <p className="font-mono text-[12px] text-text-muted">
                          {pd}/{pt.length} tareas · vence {formatDate(ph.dueDate)}
                        </p>
                        <Progress value={pt.length ? (pd / pt.length) * 100 : 0} className="mt-2 max-w-xs" />
                      </div>
                      <PhaseStatus id={ph.id} status={ph.status} />
                    </Card>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-[14px] text-text-muted">Este proyecto no tiene etapas.</p>
          )}
          <Card className="p-4">
            <PhaseForm projectId={p.id} />
          </Card>
        </div>
      ) : null}

      {tab === "entregas" ? (
        <div className="flex flex-col gap-4">
          {data.deliverables.map((d) => (
            <Card key={d.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center">
              <div className="flex-1">
                <p className="text-[15px] text-text">{d.title}</p>
                <p className="font-mono text-[12px] text-text-muted">
                  vence {formatDate(d.dueDate)}
                  {d.approvedAt ? ` · aprobada ${formatDate(d.approvedAt)}` : ""}
                </p>
                {d.contentMd ? <MarkdownView html={renderMarkdown(d.contentMd)} className="mt-2 text-[14px]" /> : null}
              </div>
              <DeliverableStatus id={d.id} status={d.status} />
            </Card>
          ))}
          {!data.deliverables.length ? (
            <p className="text-[14px] text-text-muted">Sin entregas. Registrá hitos con fecha; la aprobación del cliente se marca a mano.</p>
          ) : null}
          <Card className="p-4">
            <DeliverableForm projectId={p.id} />
          </Card>
        </div>
      ) : null}

      {tab === "decisiones" ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-3">
            {data.decisions.length ? (
              data.decisions.map((d) => (
                <Card key={d.id} className="p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
                    {formatDate(d.decidedOn)} · aprobó {d.approvedBy ?? "—"}
                  </p>
                  <p className="mt-1 text-[15px] font-medium text-text">{d.title}</p>
                  <MarkdownView html={renderMarkdown(d.rationaleMd)} className="mt-1 text-[14px] text-text-muted" />
                </Card>
              ))
            ) : (
              <p className="text-[14px] text-text-muted">
                Todavía no hay decisiones registradas. Anotá qué se decidió y por qué: dentro de seis meses lo vas a agradecer.
              </p>
            )}
          </div>
          <Card className="h-fit p-4">
            <DecisionForm projectId={p.id} />
          </Card>
        </div>
      ) : null}

      {tab === "changelog" ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <ol className="flex flex-col gap-2">
            {data.changelog.map((c) => (
              <li key={c.id} className="rounded-[10px] border border-border bg-surface p-3.5">
                <p className="font-mono text-[11px] text-text-faint">
                  {formatDate(c.createdAt)} · {c.kind === "auto" ? "automático" : c.kind === "release" ? `versión ${c.version ?? ""}` : "manual"}
                </p>
                <p className="mt-0.5 text-[14px] text-text">{c.title}</p>
                {c.bodyMd ? <MarkdownView html={renderMarkdown(c.bodyMd)} className="mt-1 text-[13px] text-text-muted" /> : null}
              </li>
            ))}
          </ol>
          <Card className="h-fit p-4">
            <ChangelogForm projectId={p.id} />
          </Card>
        </div>
      ) : null}

      {tab === "actividad" ? (
        <Card className="p-5">
          <ActivityList rows={await listActivity(ctx, { entityType: "project", entityId: id, limit: 100 })} />
        </Card>
      ) : null}
    </div>
  );
}
