"use client";

import Link from "next/link";
import { createNoteFromFormAction } from "@/app/(app)/notas/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";

type Opt = { value: string; label: string };

export function NewNoteForm({
  spaces,
  entities,
  folders,
  templates = [],
  defaults,
}: {
  spaces: Opt[];
  entities: Opt[];
  folders: string[];
  templates?: Opt[];
  defaults: { title: string; folderPath: string; spaceId: string; entity: string; templateId?: string };
}) {
  return (
    <ActionForm action={createNoteFromFormAction} successMessage="Nota creada" redirectTo={(n: { id: string }) => `/notas/${n.id}`}>
      <TextField label="Título" name="title" required autoFocus defaultValue={defaults.title} maxLength={200} placeholder="Ej.: Ideas para la tienda" />
      <SelectField
        label="Plantilla"
        name="templateId"
        defaultValue={defaults.templateId ?? ""}
        placeholder="En blanco"
        options={templates}
        hint={
          <>
            {"Reemplaza {{fecha}}, {{titulo}} y {{cliente}}. "}
            <Link href="/notas/plantillas" className="text-accent hover:underline">
              Gestionar plantillas
            </Link>
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Espacio" name="spaceId" defaultValue={defaults.spaceId} placeholder="Sin espacio" options={spaces} />
        <TextField
          label="Carpeta"
          name="folderPath"
          defaultValue={defaults.folderPath}
          list="new-note-folders"
          placeholder="Ej.: Facultad/PSEC"
          hint="Opcional."
        />
      </div>
      <datalist id="new-note-folders">
        {folders.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <SelectField
        label="Vinculada a"
        name="entity"
        defaultValue={defaults.entity}
        placeholder="Nada"
        options={entities}
        hint="Proyecto, cliente o materia (opcional)."
      />
      <div className="flex justify-end">
        <SubmitButton>Crear nota</SubmitButton>
      </div>
    </ActionForm>
  );
}
