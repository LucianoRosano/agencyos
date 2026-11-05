"use client";

import { L } from "@agencyos/core";
import { Button, cn, Sheet } from "@agencyos/ui";
import { Check, FileCheck2, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { addLaunchCheckAction, ensureDocsNoteAction, setLaunchCheckStatusAction, updateLaunchCheckAction } from "@/app/(app)/sitios/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { opts } from "./shared";

const CHOICES = [
  { v: "done", label: "Hecho", icon: <Check className="size-4" /> },
  { v: "todo", label: "Pendiente", icon: <span className="size-2 rounded-full border border-current" /> },
  { v: "na", label: "No aplica", icon: <Minus className="size-4" /> },
] as const;

/** Estado del ítem del checklist en un control segmentado (Hecho · Pendiente · No aplica). */
export function LaunchStatusToggle({ id, status, item }: { id: string; status: string; item: string }) {
  const [value, setValue] = useState(status);
  const { exec } = useAction();
  return (
    <fieldset className="flex shrink-0 rounded-[var(--radius-control)] border border-border bg-bg-elevated p-0.5">
      <legend className="sr-only">Estado de «{item}»</legend>
      {CHOICES.map((c) => (
        <button
          key={c.v}
          type="button"
          aria-pressed={value === c.v}
          title={c.label}
          onClick={() => {
            if (value === c.v) return;
            const prev = value;
            setValue(c.v);
            exec(() => setLaunchCheckStatusAction(id, c.v), {
              success: `${c.label}: ${item.slice(0, 60)}`,
              undo: async () => {
                const r = await setLaunchCheckStatusAction(id, prev);
                if (r.ok) setValue(prev);
                return r;
              },
            });
          }}
          className={cn(
            "flex h-10 min-w-11 items-center justify-center gap-1.5 rounded-[6px] px-2.5 text-[13px] transition-colors",
            value === c.v
              ? c.v === "done"
                ? "bg-success-soft text-success"
                : c.v === "na"
                  ? "bg-surface-3 text-text"
                  : "bg-warning-soft text-warning"
              : "text-text-muted hover:text-text",
          )}
        >
          {c.icon}
          <span className="hidden sm:inline">{c.label}</span>
        </button>
      ))}
    </fieldset>
  );
}

export function LaunchEditSheet({
  id,
  item,
  status,
  ownerType,
  evidenceMd,
}: {
  id: string;
  item: string;
  status: string;
  ownerType: string;
  evidenceMd: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Ítem del checklist"
      description={item}
      wide
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Responsable y evidencia de «${item}»`}>
          <FileCheck2 className="size-4" />
        </Button>
      }
    >
      <ActionForm action={updateLaunchCheckAction.bind(null, id)} successMessage="Ítem actualizado" onSuccess={() => setOpen(false)}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SelectField label="Estado" name="status" defaultValue={status} options={opts(L.launchStatus)} />
          <SelectField label="Responsable" name="ownerType" defaultValue={ownerType} options={opts(L.siteAssignee)} />
        </div>
        <TextAreaField
          label="Evidencia (Markdown)"
          name="evidenceMd"
          defaultValue={evidenceMd ?? ""}
          rows={5}
          placeholder="Enlace a la captura, resultado de PageSpeed, número de pedido de prueba…"
        />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function NewLaunchCheckSheet({ siteId, areas }: { siteId: string; areas: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nuevo ítem del checklist"
      wide
      trigger={
        <Button variant="secondary">
          <Plus className="size-4" /> Agregar ítem
        </Button>
      }
    >
      <ActionForm action={addLaunchCheckAction.bind(null, siteId)} successMessage="Ítem agregado" onSuccess={() => setOpen(false)}>
        <SelectField label="Área" name="area" options={areas} />
        <TextField label="Ítem" name="item" required maxLength={300} />
        <SelectField label="Responsable" name="ownerType" defaultValue="user" options={opts(L.siteAssignee)} />
        <div className="flex justify-end">
          <SubmitButton>Agregar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function EnsureDocsButton({ siteId }: { siteId: string }) {
  const { exec, pending } = useAction();
  return (
    <Button variant="primary" loading={pending} onClick={() => exec(() => ensureDocsNoteAction(siteId), { success: "Nota de documentación creada" })}>
      <Plus className="size-4" /> Crear la documentación
    </Button>
  );
}
