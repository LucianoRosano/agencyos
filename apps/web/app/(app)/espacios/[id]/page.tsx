import { getDb, schema } from "@agencyos/db";
import { listProjects } from "@agencyos/modules/projects/queries";
import { scoped } from "@agencyos/modules/shared/db";
import { listTasks } from "@agencyos/modules/tasks/queries";
import { EmptyState, PageHeader, SectionLabel } from "@agencyos/ui";
import { and, eq } from "drizzle-orm";
import { FolderKanban } from "lucide-react";
import { notFound } from "next/navigation";
import { ProjectCard } from "@/components/project-card";
import { TaskRow } from "@/components/tasks/task-row";
import { requireCtx } from "@/lib/session";

export default async function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const [space] = await getDb().select().from(schema.space).where(and(eq(schema.space.id, id), scoped(schema.space, ctx)));
  if (!space) notFound();
  const [projects, tasks] = await Promise.all([listProjects(ctx, { spaceId: id }), listTasks(ctx, { view: "todas", spaceId: id, limit: 30 })]);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Espacio" title={space.name} accent={space.color} />
      <SectionLabel className="mb-3">Proyectos</SectionLabel>
      {projects.length ? (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{projects.map(({ p, clientName, spaceName, spaceColor }) => <ProjectCard key={p.id} p={{ ...p, clientName, spaceName, spaceColor }} />)}</div>
      ) : (
        <EmptyState compact icon={<FolderKanban />} title="Sin proyectos activos en este espacio" />
      )}
      <SectionLabel className="mt-6 mb-3">Tareas abiertas</SectionLabel>
      {tasks.length ? <ul className="overflow-hidden rounded-[var(--radius-card)] border border-border">{tasks.map((r) => <TaskRow key={r.t.id} task={{ ...r.t, projectName: r.projectName, clientName: r.clientName, spaceColor: r.spaceColor }} />)}</ul> : <p className="text-[14px] text-text-muted">Sin tareas abiertas.</p>}
    </div>
  );
}
