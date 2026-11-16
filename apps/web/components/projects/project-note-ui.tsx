"use client";

import { Button } from "@agencyos/ui";
import { ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { updateProjectNoteAction } from "@/app/(app)/proyectos/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TextAreaField } from "@/components/fields";
import { MarkdownView } from "@/components/markdown";

/** Nota de un proyecto: lectura en Markdown y edición del cuerpo (el colaborador no la renombra ni la mueve). */
export function ProjectNoteEditor({
  projectId,
  noteId,
  bodyMd,
  html,
  fullHref,
}: {
  projectId: string;
  noteId: string;
  bodyMd: string;
  html: string;
  fullHref: string | null;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <div className="flex flex-col gap-4">
        <MarkdownView html={html} empty="La nota está vacía." />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Editar
          </Button>
          {fullHref ? (
            <Button asChild variant="ghost">
              <Link href={fullHref}>
                <ExternalLink className="size-4" /> Abrir en Notas
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  return (
    <ActionForm action={updateProjectNoteAction.bind(null, projectId, noteId)} successMessage="Nota guardada" onSuccess={() => setEditing(false)}>
      <TextAreaField label="Contenido (Markdown)" name="bodyMd" defaultValue={bodyMd} rows={16} className="font-mono" autoFocus />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
        <SubmitButton>Guardar</SubmitButton>
      </div>
    </ActionForm>
  );
}
