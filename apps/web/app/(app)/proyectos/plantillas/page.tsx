import { L, label } from "@agencyos/core";
import { listTemplates } from "@agencyos/modules/projects/queries";
import { Button, Card, PageHeader } from "@agencyos/ui";
import Link from "next/link";
import { requireCtx } from "@/lib/session";
import { DeleteTemplateButton } from "./delete-button";

export const metadata = { title: "Plantillas de proyecto" };

export default async function TemplatesPage() {
  const ctx = await requireCtx();
  const templates = await listTemplates(ctx);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Proyectos"
        title="Plantillas"
        description="Generan etapas, tareas fechadas, checklist, nota inicial y preguntas al cliente. Guardá cualquier proyecto como plantilla desde su menú."
        accent="#7C5CFF"
      />
      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((t) => (
          <Card key={t.id} className="flex flex-col gap-3 p-5">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">{label(L.projectKind, t.kind)}</p>
              <h2 className="mt-1 text-[16px] font-medium">{t.name}</h2>
              <p className="mt-1 text-[13px] text-text-muted">{t.description}</p>
            </div>
            <ol className="flex flex-wrap gap-1.5">
              {t.definition.phases.map((p, i) => (
                <li key={`${p.name}-${i}`} className="rounded-md border border-border px-2 py-0.5 text-[12px] text-text-muted">
                  {p.name} <span className="font-mono text-text-faint">{p.tasks.length}</span>
                </li>
              ))}
            </ol>
            <div className="mt-auto flex items-center justify-between pt-2">
              {t.key ? <span className="text-[12px] text-text-faint">Plantilla inicial</span> : <DeleteTemplateButton id={t.id} name={t.name} />}
              <Button asChild variant="primary" size="sm">
                <Link href={`/proyectos/nuevo?plantilla=${t.id}`}>Usar</Link>
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
