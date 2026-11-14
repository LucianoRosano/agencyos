import { formatDate, L, label } from "@agencyos/core";
import type { getMemberToday } from "@agencyos/modules/today/queries";
import { BlockCard, EmptyState, Progress } from "@agencyos/ui";
import { CircleCheck, FolderKanban, PackageCheck } from "lucide-react";
import Link from "next/link";
import { TaskRow } from "@/components/tasks/task-row";

type Data = Awaited<ReturnType<typeof getMemberToday>>;

/** "Hoy" de un colaborador: sus tareas, entregas y proyectos asignados. */
export function MemberToday({ data }: { data: Data }) {
  const tasks = [...data.overdue, ...data.forToday, ...data.upcoming, ...data.undated];
  return (
    <div className="grid gap-4 md:gap-5 lg:grid-cols-2">
      <BlockCard icon={<CircleCheck />} title="Mis tareas (próximos 7 días)" className="lg:row-span-2">
        {tasks.length ? (
          <ul className="flex flex-col">
            {tasks.slice(0, 40).map((r) => (
              <li key={r.t.id}>
                <TaskRow task={{ ...r.t, projectName: r.projectName }} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={<CircleCheck />}
            title="No tenés tareas pendientes"
            description="Las tareas de tus proyectos con fecha en los próximos 7 días aparecen acá."
            action={
              <Link className="text-[13px] text-accent hover:underline" href="/tareas">
                Ver todas las tareas
              </Link>
            }
          />
        )}
      </BlockCard>
      <BlockCard icon={<PackageCheck />} title="Entregas pendientes">
        {data.deliverables.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {data.deliverables.map(({ d, projectName }) => (
              <li key={d.id}>
                <Link href={`/proyectos/${d.projectId}/entregas`} className="flex min-h-11 items-center gap-3 py-2 text-[14px] hover:underline">
                  <span className="min-w-0 flex-1 truncate">{d.title}</span>
                  <span className="shrink-0 text-[12px] text-text-muted">
                    {projectName} · {d.dueDate ? formatDate(d.dueDate) : label(L.deliverableStatus, d.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={<PackageCheck />} title="Sin entregas pendientes" description="Las entregas de tus proyectos aparecen acá." />
        )}
      </BlockCard>
      <BlockCard icon={<FolderKanban />} title="Mis proyectos">
        {data.projects.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {data.projects.map((p) => (
              <li key={p.id}>
                <Link href={`/proyectos/${p.id}`} className="flex flex-col gap-1.5 py-3 hover:underline">
                  <span className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="shrink-0 text-[12px] text-text-muted">{label(L.projectStatus, p.status)}</span>
                  </span>
                  <Progress value={p.progress} />
                  {p.nextAction ? <span className="truncate text-[13px] text-text-muted">Siguiente: {p.nextAction}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={<FolderKanban />}
            title="Todavía no tenés proyectos asignados"
            description="Luciano te asigna proyectos desde Configuración → Usuarios."
          />
        )}
      </BlockCard>
    </div>
  );
}
