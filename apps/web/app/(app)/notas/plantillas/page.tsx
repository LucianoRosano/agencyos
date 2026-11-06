import { ensureNoteTemplates, listNoteTemplates } from "@agencyos/modules/notes/templates";
import { Card, EmptyState, PageHeader } from "@agencyos/ui";
import { LayoutTemplate } from "lucide-react";
import Link from "next/link";
import { NewTemplateButton, TemplateActions } from "@/components/notes/note-templates-ui";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Plantillas de notas" };

/** Primeras líneas con contenido, sin marcas de Markdown, para la vista previa de la tarjeta. */
function excerpt(md: string) {
  return md
    .split("\n")
    .map((l) => l.replace(/^#+\s*|^[-*]\s*(\[ \]\s*)?|\*\*/g, "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
}

export default async function NoteTemplatesPage() {
  const ctx = await requireCtx();
  await ensureNoteTemplates(ctx);
  const templates = await listNoteTemplates(ctx);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow={
          <Link href="/notas" className="hover:text-text">
            Notas
          </Link>
        }
        title="Plantillas"
        accent="#C9D1E0"
        description="Estructuras para arrancar notas rápido. Variables: {{fecha}}, {{titulo}} y {{cliente}}."
        actions={<NewTemplateButton />}
      />
      {templates.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-text">{t.name}</p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-text-muted">{excerpt(t.bodyMd) || "Sin contenido"}</p>
                </div>
                <TemplateActions template={{ id: t.id, name: t.name, bodyMd: t.bodyMd }} />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="p-2">
          <EmptyState
            icon={<LayoutTemplate />}
            title="Sin plantillas"
            description="Creá una estructura (acta de reunión, briefing, checklist) y usala cada vez que arrancás una nota."
            action={<NewTemplateButton />}
          />
        </Card>
      )}
    </div>
  );
}
