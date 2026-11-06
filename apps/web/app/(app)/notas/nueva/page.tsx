import { folderPaths, linkableEntities } from "@agencyos/modules/notes/queries";
import { ensureNoteTemplates, listNoteTemplates } from "@agencyos/modules/notes/templates";
import { Card, PageHeader } from "@agencyos/ui";
import { NewNoteForm } from "@/components/notes/new-note-form";
import { spaceOpts } from "@/lib/options";
import { getSelectedSpace } from "@/lib/prefs";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Nueva nota" };

export default async function NewNotePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  await ensureNoteTemplates(ctx);
  const [spaces, entities, folders, selected, templates] = await Promise.all([
    spaceOpts(ctx),
    linkableEntities(ctx),
    folderPaths(ctx),
    getSelectedSpace(),
    listNoteTemplates(ctx),
  ]);
  const entity = sp.entityType && sp.entityId ? `${sp.entityType}:${sp.entityId}` : "";
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Notas"
        title="Nueva nota"
        accent="#C9D1E0"
        description="En blanco o desde una plantilla. Después escribís en Markdown con autoguardado."
      />
      <Card className="p-5">
        <NewNoteForm
          spaces={spaces}
          entities={entities}
          folders={folders}
          templates={templates.map((t) => ({ value: t.id, label: t.name }))}
          defaults={{
            templateId: templates.some((t) => t.id === sp.plantilla) ? sp.plantilla : sp.desde === "plantilla" ? (templates[0]?.id ?? "") : "",
            title: sp.titulo?.slice(0, 200) ?? "",
            folderPath: sp.carpeta ?? "",
            spaceId: sp.espacio ?? selected ?? "",
            entity: entities.some((e) => e.value === entity) ? entity : "",
          }}
        />
      </Card>
    </div>
  );
}
