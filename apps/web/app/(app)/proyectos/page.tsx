import { diffDays, L, todayAR, toISODateAR } from "@agencyos/core";
import { listProjects } from "@agencyos/modules/projects/queries";
import { Button, EmptyState, PageHeader, Tabs } from "@agencyos/ui";
import { FolderKanban, LayoutTemplate, Plus } from "lucide-react";
import Link from "next/link";
import { ProjectCard } from "@/components/project-card";
import { getSelectedSpace } from "@/lib/prefs";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Proyectos" };

const FILTERS = [
  { key: "activos", label: "Activos" },
  { key: "in_progress", label: "En curso" },
  { key: "planning", label: "Planificación" },
  { key: "idea", label: "Ideas" },
  { key: "paused", label: "En pausa" },
  { key: "blocked", label: "Bloqueados" },
  { key: "done", label: "Terminados" },
];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const f = sp.estado && sp.estado !== "activos" ? sp.estado : undefined;
  const rows = await listProjects(ctx, { status: f, spaceId: await getSelectedSpace(), q: sp.q });
  const stalledDays = ctx.workspace.settings.stalledDays ?? 14;
  const today = todayAR();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Proyectos y tareas"
        title="Proyectos"
        accent="#7C5CFF"
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/proyectos/plantillas"><LayoutTemplate className="size-4" /> Plantillas</Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/proyectos/nuevo"><Plus className="size-4" /> Nuevo proyecto</Link>
            </Button>
          </>
        }
      />
      <Tabs active={sp.estado ?? "activos"} items={FILTERS.map((x) => ({ key: x.key, label: x.label, href: `/proyectos?estado=${x.key}` }))} />
      <form className="mb-5" action="/proyectos">
        {sp.estado ? <input type="hidden" name="estado" value={sp.estado} /> : null}
        <input name="q" defaultValue={sp.q} placeholder="Buscar proyectos…" aria-label="Buscar proyectos" className="h-10 w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 text-base md:max-w-sm md:text-sm" />
      </form>
      {rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ p, clientName, spaceName, spaceColor }) => (
            <ProjectCard
              key={p.id}
              p={{ ...p, clientName, spaceName, spaceColor, stalled: p.status === "in_progress" && diffDays(today, toISODateAR(p.lastActivityAt)) > stalledDays }}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FolderKanban />}
          title={f ? `No hay proyectos «${L.projectStatus[f as keyof typeof L.projectStatus] ?? f}»` : "Todavía no hay proyectos"}
          description="Arrancá uno con el asistente: elegís plantilla, cliente, qué significa terminado y la primera acción. Menos de 2 minutos."
          action={<Button asChild variant="primary"><Link href="/proyectos/nuevo"><Plus className="size-4" /> Nuevo proyecto</Link></Button>}
        />
      )}
    </div>
  );
}
