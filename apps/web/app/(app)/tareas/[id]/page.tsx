import { formatDateTime, L, label } from "@agencyos/core";
import { getTask } from "@agencyos/modules/tasks/queries";
import { Badge, Card, PageHeader, SectionLabel } from "@agencyos/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewTaskSheet } from "@/components/tasks/task-form";
import { TaskRow } from "@/components/tasks/task-row";
import { projectOpts, spaceOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";
import { Checklist, TaskActions, TaskEditForm } from "./task-detail";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const data = await getTask(ctx, id);
  if (!data) notFound();
  const [projects, spaces] = await Promise.all([projectOpts(ctx), spaceOpts(ctx)]);
  const t = data.t;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            Tarea{" "}
            {data.projectName ? (
              <>
                ·{" "}
                <Link className="hover:text-text" href={`/proyectos/${t.projectId}`}>
                  {data.projectName}
                </Link>
              </>
            ) : null}
          </span>
        }
        title={t.title}
        accent="#60A5FA"
        actions={<TaskActions id={t.id} status={t.status} title={t.title} />}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={t.status === "done" ? "success" : t.status === "doing" ? "accent" : "neutral"}>{label(L.taskStatus, t.status)}</Badge>
        <Badge tone={t.priority <= 2 ? "warning" : "neutral"}>{L.priority[t.priority]}</Badge>
        {t.completedAt ? <Badge tone="success">Completada {formatDateTime(t.completedAt)}</Badge> : null}
      </div>
      <div className="grid gap-6">
        <Card className="p-5">
          <TaskEditForm
            id={t.id}
            projects={projects}
            spaces={spaces}
            phases={data.phases.map((p) => ({ value: p.id, label: p.name }))}
            defaults={{
              title: t.title,
              dueDate: t.dueDate,
              dueTime: t.dueTime,
              priority: t.priority,
              rrule: t.rrule,
              projectId: t.projectId,
              phaseId: t.phaseId,
              spaceId: t.spaceId,
              estimateMinutes: t.estimateMinutes,
              descriptionMd: t.descriptionMd,
            }}
          />
        </Card>
        <Card className="p-5">
          <SectionLabel className="mb-3">Checklist</SectionLabel>
          <Checklist taskId={t.id} items={data.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done }))} />
        </Card>
        {!t.parentTaskId ? (
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>Subtareas</SectionLabel>
              <NewTaskSheet
                projects={projects}
                spaces={spaces}
                defaults={{ parentTaskId: t.id, projectId: t.projectId, spaceId: t.spaceId }}
                trigger={
                  <button type="button" className="text-[13px] text-accent hover:underline">
                    + Agregar
                  </button>
                }
              />
            </div>
            {data.subtasks.length ? (
              <ul className="overflow-hidden rounded-[10px] border border-border">
                {data.subtasks.map((s) => (
                  <TaskRow key={s.id} task={s} showProject={false} />
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-text-faint">Sin subtareas. Usalas para partir una tarea grande (un solo nivel).</p>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
