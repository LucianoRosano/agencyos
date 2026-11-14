import { formatDate, greeting, L, label } from "@agencyos/core";
import { portalHome } from "@agencyos/modules/portal/service";
import { Badge, Card, EmptyState, PageHeader, Progress, SectionLabel } from "@agencyos/ui";
import { FolderKanban, PackageCheck } from "lucide-react";
import Link from "next/link";
import { firstName, requirePortalCtx } from "@/lib/session";

export const metadata = { title: "Inicio" };
const PORTAL_ACCENT = "#22D3EE";

const DELIVERABLE_TONE = { pending: "neutral", delivered: "accent", approved: "success", changes_requested: "warning" } as const;

export default async function PortalHome() {
  const pc = await requirePortalCtx();
  if (!pc.clientId)
    return (
      <EmptyState
        icon={<FolderKanban />}
        title="Tu acceso todavía no tiene proyectos"
        description="Luciano tiene que vincular tu cuenta con tu empresa. Escribile y lo resuelve en un minuto."
      />
    );
  const data = await portalHome(pc);
  const toApprove = data.deliverables.filter((d) => d.status === "delivered");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={data.clientName ?? "Portal"}
        title={`${greeting(new Date())}, ${firstName(pc.user.name)}`}
        description={
          toApprove.length
            ? `Tenés ${toApprove.length} ${toApprove.length === 1 ? "entrega para aprobar" : "entregas para aprobar"}.`
            : "Acá ves cómo vienen tus proyectos."
        }
        accent={PORTAL_ACCENT}
      />
      <section aria-labelledby="proyectos">
        <SectionLabel className="mb-3">
          <span id="proyectos">Tus proyectos</span>
        </SectionLabel>
        {data.projects.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {data.projects.map((p) => (
              <Link key={p.id} href={`/portal/proyectos/${p.id}`} className="group" data-testid="portal-project">
                <Card className="flex h-full flex-col gap-3 p-5 transition-colors group-hover:border-border-strong">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[16px] font-medium">{p.name}</p>
                    <Badge>{label(L.projectStatus, p.status)}</Badge>
                  </div>
                  <p className="text-[13px] text-text-muted">{p.currentPhase ? `Etapa actual: ${p.currentPhase}` : "Sin etapas cargadas"}</p>
                  <div className="mt-auto">
                    <div className="mb-1.5 flex justify-between text-[12px] text-text-muted">
                      <span>Avance</span>
                      <span className="font-mono">{p.progress}%</span>
                    </div>
                    <Progress value={p.progress} label={`Avance de ${p.name}`} />
                  </div>
                  {p.targetDate ? <p className="text-[12px] text-text-faint">Fecha objetivo: {formatDate(p.targetDate)}</p> : null}
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="p-5">
            <EmptyState compact icon={<FolderKanban />} title="Todavía no hay proyectos" description="Cuando Luciano arranque tu proyecto lo vas a ver acá." />
          </Card>
        )}
      </section>
      <section aria-labelledby="entregas">
        <SectionLabel className="mb-3">
          <span id="entregas">Próximas entregas</span>
        </SectionLabel>
        <Card className="p-2">
          {data.deliverables.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {data.deliverables.map((d) => (
                <li key={d.id}>
                  <Link href={`/portal/proyectos/${d.projectId}#entregas`} className="flex min-h-12 items-center gap-3 rounded-md px-3 py-2 hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px]">{d.title}</span>
                      <span className="block truncate text-[12px] text-text-muted">
                        {d.projectName}
                        {d.dueDate ? ` · ${formatDate(d.dueDate)}` : ""}
                      </span>
                    </span>
                    <Badge tone={DELIVERABLE_TONE[d.status as keyof typeof DELIVERABLE_TONE] ?? "neutral"}>
                      {d.status === "delivered" ? "Para aprobar" : label(L.deliverableStatus, d.status)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={<PackageCheck />} title="No hay entregas pendientes" description="Cuando haya algo para revisar te va a aparecer acá." />
          )}
        </Card>
      </section>
    </div>
  );
}
