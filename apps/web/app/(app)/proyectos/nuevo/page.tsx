import { listTemplates } from "@agencyos/modules/projects/queries";
import { PageHeader } from "@agencyos/ui";
import { clientOpts, spaceOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";
import { Wizard } from "./wizard";

export const metadata = { title: "Nuevo proyecto" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const [templates, clients, spaces] = await Promise.all([listTemplates(ctx), clientOpts(ctx), spaceOpts(ctx)]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Asistente de arranque · 5 pasos" title="Nuevo proyecto" accent="#7C5CFF" />
      <Wizard
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description ?? "",
          phases: t.definition.phases.length,
          tasks: t.definition.phases.reduce((a, p) => a + p.tasks.length, 0),
        }))}
        clients={clients}
        spaces={spaces}
        initialClientId={sp.cliente}
        initialTemplateId={sp.plantilla}
        quoteId={sp.presupuesto}
        initialName={sp.nombre}
      />
    </div>
  );
}
