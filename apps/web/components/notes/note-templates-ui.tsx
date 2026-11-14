"use client";

import { Button, Sheet } from "@agencyos/ui";
import { FilePlus2, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { createNoteTemplateAction, deleteNoteTemplateAction, restoreNoteTemplateAction, updateNoteTemplateAction } from "@/app/(app)/notas/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

type Tpl = { id: string; name: string; bodyMd: string };

export function NoteTemplateSheet({ template, trigger }: { template?: Tpl; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const action = template ? updateNoteTemplateAction.bind(null, template.id) : createNoteTemplateAction;
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      wide
      title={template ? "Editar plantilla" : "Nueva plantilla"}
      description="Markdown. Variables: {{fecha}} (hoy), {{titulo}} (título de la nota) y {{cliente}} (cliente vinculado)."
      trigger={trigger}
    >
      <ActionForm
        action={action}
        successMessage={template ? "Plantilla guardada" : "Plantilla creada"}
        onSuccess={() => setOpen(false)}
        resetOnSuccess={!template}
      >
        <TextField label="Nombre" name="name" required maxLength={120} defaultValue={template?.name ?? ""} placeholder="Ej.: Acta de reunión" />
        <TextAreaField
          label="Contenido"
          name="bodyMd"
          rows={14}
          defaultValue={template?.bodyMd ?? ""}
          className="font-mono"
          placeholder={"## Temas\n- \n\n## Próximos pasos\n- [ ] "}
        />
        <div className="flex justify-end">
          <SubmitButton>{template ? "Guardar" : "Crear plantilla"}</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function NewTemplateButton({ variant = "primary" }: { variant?: "primary" | "secondary" }) {
  return (
    <NoteTemplateSheet
      trigger={
        <Button variant={variant}>
          <Plus className="size-4" /> Nueva plantilla
        </Button>
      }
    />
  );
}

export function TemplateActions({ template }: { template: Tpl }) {
  const { exec } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button asChild size="sm" variant="secondary">
        <Link href={`/notas/nueva?plantilla=${template.id}`}>
          <FilePlus2 className="size-4" /> Usar
        </Link>
      </Button>
      <NoteTemplateSheet
        template={template}
        trigger={
          <Button size="icon" variant="ghost" className="max-md:size-11" aria-label={`Editar «${template.name}»`}>
            <Pencil className="size-4" />
          </Button>
        }
      />
      <Button
        size="icon"
        variant="ghost"
        className="max-md:size-11"
        aria-label={`Eliminar «${template.name}»`}
        onClick={() => {
          if (!confirm(`¿Mandar la plantilla «${template.name}» a la papelera? Las notas creadas con ella no cambian.`)) return;
          exec(() => deleteNoteTemplateAction(template.id), { success: "Plantilla en la papelera", undo: () => restoreNoteTemplateAction(template.id) });
        }}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
