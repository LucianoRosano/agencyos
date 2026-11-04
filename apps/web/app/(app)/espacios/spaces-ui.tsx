"use client";

import { Button, cn, Sheet } from "@agencyos/ui";
import { ArrowDown, ArrowUp, Pencil } from "lucide-react";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { archiveSpaceAction, createSpaceAction, moveSpaceAction, updateSpaceAction } from "./actions";

function ColorPicker({ colors, value }: { colors: string[]; value?: string }) {
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="mb-1.5 text-[13px] font-medium text-text-muted">Color</legend>
      {colors.map((c, i) => (
        <label key={c} className="cursor-pointer">
          <input type="radio" name="color" value={c} defaultChecked={value ? value === c : i === 0} className="peer sr-only" />
          <span className="block size-9 rounded-full border-2 border-transparent peer-checked:border-text peer-focus-visible:ring-2 peer-focus-visible:ring-accent" style={{ background: c }} aria-label={c} />
        </label>
      ))}
    </fieldset>
  );
}

export function SpaceForm({ colors }: { colors: string[] }) {
  return (
    <ActionForm action={createSpaceAction} successMessage="Espacio creado" resetOnSuccess>
      <TextField label="Nombre" name="name" required maxLength={40} />
      <ColorPicker colors={colors} />
      <SubmitButton className="self-start">Crear espacio</SubmitButton>
    </ActionForm>
  );
}

export function SpaceRowActions({ id, name, color, colors, first, last, custom }: { id: string; name: string; color: string; colors: string[]; first: boolean; last: boolean; custom: boolean }) {
  const { exec } = useAction();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="ghost" aria-label={`Subir ${name}`} disabled={first} onClick={() => exec(() => moveSpaceAction(id, -1))}><ArrowUp className="size-4" /></Button>
      <Button size="icon" variant="ghost" aria-label={`Bajar ${name}`} disabled={last} onClick={() => exec(() => moveSpaceAction(id, 1))}><ArrowDown className="size-4" /></Button>
      <Sheet open={open} onOpenChange={setOpen} title={`Editar «${name}»`} trigger={<Button size="icon" variant="ghost" aria-label={`Editar ${name}`}><Pencil className="size-4" /></Button>}>
        <ActionForm action={updateSpaceAction.bind(null, id)} successMessage="Espacio actualizado" onSuccess={() => setOpen(false)}>
          <TextField label="Nombre" name="name" defaultValue={name} required />
          <ColorPicker colors={colors} value={color} />
          <div className={cn("flex", custom ? "justify-between" : "justify-end")}>
            {custom ? <Button type="button" variant="danger" onClick={() => { if (confirm(`¿Archivar «${name}»? Sus elementos no se borran.`)) exec(() => archiveSpaceAction(id), { success: "Espacio archivado", onDone: () => setOpen(false) }); }}>Archivar</Button> : null}
            <SubmitButton>Guardar</SubmitButton>
          </div>
        </ActionForm>
      </Sheet>
    </div>
  );
}
