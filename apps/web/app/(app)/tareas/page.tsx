import { todayAR } from "@agencyos/core";
import { tagsFor } from "@agencyos/modules/collab/service";
import { listTasks, type TaskView } from "@agencyos/modules/tasks/queries";
import { Button, EmptyState, PageHeader, Tabs } from "@agencyos/ui";
import { CircleCheck, Columns3, List, Plus } from "lucide-react";
import Link from "next/link";
import { filterByTag, ListToolbar } from "@/components/collab/list-toolbar";
import { TaskBoard } from "@/components/tasks/task-board";
import { NewTaskSheet } from "@/components/tasks/task-form";
import { TaskRow, type TaskRowData } from "@/components/tasks/task-row";
import { projectOpts, spaceOpts } from "@/lib/options";
import { getSelectedSpace } from "@/lib/prefs";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Tareas" };

const VIEWS: { key: TaskView; label: string }[] = [
  { key: "hoy", label: "Hoy" },
  { key: "proximas", label: "Próximas" },
  { key: "sin-fecha", label: "Sin fecha" },
  { key: "todas", label: "Abiertas" },
  { key: "completadas", label: "Completadas" },
];

export default async function TareasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const view = (VIEWS.find((v) => v.key === sp.ver)?.key ?? "hoy") as TaskView;
  const board = sp.vista === "kanban";
  const spaceId = await getSelectedSpace();
  const [rows, projects, spaces] = await Promise.all([listTasks(ctx, { view: board ? "todas" : view, spaceId, q: sp.q }), projectOpts(ctx), spaceOpts(ctx)]);
  const tagged = await filterByTag(ctx, "task", sp.etiqueta, rows, (r) => r.t.id);
  const tagMap = await tagsFor(
    ctx,
    "task",
    tagged.map((r) => r.t.id),
  );
  const tasks: TaskRowData[] = tagged.map((r) => ({
    ...r.t,
    tags: tagMap.get(r.t.id),
    projectName: r.projectName,
    clientName: r.clientName,
    spaceColor: r.spaceColor,
  }));
  const qs = (o: Record<string, string>) =>
    `/tareas?${new URLSearchParams({ ...(sp.ver ? { ver: sp.ver } : {}), ...(sp.vista ? { vista: sp.vista } : {}), ...o })}`;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Proyectos y tareas"
        title="Tareas"
        accent="#7C5CFF"
        actions={
          <>
            <Button asChild variant="ghost" size="sm" aria-label={board ? "Ver como lista" : "Ver como kanban"}>
              <Link href={board ? qs({ vista: "lista" }) : qs({ vista: "kanban" })}>
                {board ? <List className="size-4" /> : <Columns3 className="size-4" />} {board ? "Lista" : "Kanban"}
              </Link>
            </Button>
            <NewTaskSheet
              projects={projects}
              spaces={spaces}
              defaults={{ dueDate: view === "hoy" ? todayAR() : "", spaceId: spaceId ?? "" }}
              openInitially={sp.nueva === "1"}
              trigger={
                <Button variant="primary">
                  <Plus className="size-4" /> Nueva tarea
                </Button>
              }
            />
          </>
        }
      />
      {!board ? <Tabs active={view} items={VIEWS.map((v) => ({ key: v.key, label: v.label, href: `/tareas?ver=${v.key}` }))} /> : null}
      <ListToolbar ctx={ctx} module="tareas" basePath="/tareas" sp={sp} />
      <form className="mb-4" action="/tareas">
        {sp.ver ? <input type="hidden" name="ver" value={sp.ver} /> : null}
        {sp.vista ? <input type="hidden" name="vista" value={sp.vista} /> : null}
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Buscar en tareas…"
          className="h-10 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base md:max-w-sm md:text-sm"
        />
      </form>
      {board ? (
        <TaskBoard tasks={tasks} />
      ) : tasks.length ? (
        <ul className="overflow-hidden rounded-[var(--radius-card)] border border-border">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<CircleCheck />}
          title={view === "hoy" ? "Nada pendiente para hoy" : view === "completadas" ? "Todavía no completaste tareas" : "No hay tareas en esta vista"}
          description="Las tareas con fecha aparecen en Hoy. Capturá con C o creá una tarea con fecha."
        />
      )}
    </div>
  );
}
