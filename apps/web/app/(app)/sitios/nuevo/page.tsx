import { projectPrefill, siteFormOptions, siteForProject } from "@agencyos/modules/sites/queries";
import { Button, Card, PageHeader } from "@agencyos/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SITES_ACCENT } from "@/components/sites/shared";
import { NewSiteForm } from "@/components/sites/site-form";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Nuevo sitio" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_TO_SITE: Record<string, string> = { store: "store", website: "institutional", panel: "app" };

export default async function NewSitePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const projectId = sp.proyecto && UUID.test(sp.proyecto) ? sp.proyecto : undefined;
  if (projectId) {
    const existing = await siteForProject(ctx, projectId);
    if (existing) redirect(`/sitios/${existing.id}`);
  }
  const [{ clients, projects }, project] = await Promise.all([siteFormOptions(ctx), projectId ? projectPrefill(ctx, projectId) : Promise.resolve(null)]);
  const clientId = project?.clientId ?? (sp.cliente && UUID.test(sp.cliente) ? sp.cliente : null);
  const kind = project ? (PROJECT_TO_SITE[project.kind] ?? "institutional") : "institutional";
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow={project ? `Desde el proyecto · ${project.name}` : "Website Factory"}
        title="Nuevo sitio"
        accent={SITES_ACCENT}
        actions={
          <Button asChild variant="ghost">
            <Link href={project ? `/proyectos/${project.id}` : "/sitios"}>Cancelar</Link>
          </Button>
        }
      />
      <Card className="p-4 md:p-6">
        <NewSiteForm
          clients={clients.map((c) => ({ value: c.id, label: c.name }))}
          projects={projects.map((p) => ({ value: p.id, label: p.name, clientId: p.clientId, kind: p.kind }))}
          defaults={{
            name: project?.name ?? "",
            clientId,
            projectId: project?.id ?? null,
            kind,
            stack: kind === "store" ? "woocommerce" : "wordpress",
          }}
        />
      </Card>
    </div>
  );
}
