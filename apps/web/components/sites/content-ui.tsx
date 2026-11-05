"use client";

import { L } from "@agencyos/core";
import { Button, Select, Sheet } from "@agencyos/ui";
import { PenLine } from "lucide-react";
import { useState } from "react";
import { setSlotStatusAction, updateSlotAction } from "@/app/(app)/sitios/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { opts, SLOT_COLOR, SLOT_STATUS_ORDER } from "./shared";

/** Estado del slot editable inline (con Deshacer). */
export function SlotStatusSelect({ id, status, label }: { id: string; status: string; label: string }) {
  const { exec } = useAction();
  const [value, setValue] = useState(status);
  return (
    <span className="relative inline-flex w-full sm:w-40">
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-2 -translate-y-1/2 rounded-full"
        style={{ background: SLOT_COLOR[value] }}
      />
      <Select
        aria-label={`Estado de «${label}»`}
        value={value}
        onChange={(e) => {
          const prev = value;
          const next = e.target.value;
          setValue(next);
          exec(() => setSlotStatusAction(id, next), {
            success: `«${label}»: ${L.slotStatus[next as keyof typeof L.slotStatus].toLowerCase()}`,
            undo: async () => {
              const r = await setSlotStatusAction(id, prev);
              if (r.ok) setValue(prev);
              return r;
            },
          });
        }}
        className="pl-7"
      >
        {SLOT_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {L.slotStatus[s]}
          </option>
        ))}
      </Select>
    </span>
  );
}

export function SlotEditSheet({
  id,
  title,
  kindLabel,
  status,
  assigneeType,
  bodyMd,
}: {
  id: string;
  title: string;
  kindLabel: string;
  status: string;
  assigneeType: string;
  bodyMd: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={`Slot de tipo ${kindLabel.toLowerCase()}`}
      wide
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Editar contenido de «${title}»`}>
          <PenLine className="size-4" />
        </Button>
      }
    >
      <ActionForm action={updateSlotAction.bind(null, id)} successMessage="Contenido guardado" onSuccess={() => setOpen(false)}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SelectField label="Estado" name="status" defaultValue={status} options={opts(L.slotStatus)} />
          <SelectField label="Responsable" name="assigneeType" defaultValue={assigneeType} options={opts(L.siteAssignee)} />
        </div>
        <TextAreaField
          label="Contenido (Markdown)"
          name="bodyMd"
          defaultValue={bodyMd ?? ""}
          rows={10}
          className="font-mono"
          hint="Texto final, indicaciones para la imagen o el producto destacado. Los archivos van en Recursos."
        />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}
