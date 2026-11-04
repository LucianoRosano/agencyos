"use client";

import { L, RECURRENCE_PRESETS } from "@agencyos/core";
import { Sheet } from "@agencyos/ui";
import { useState } from "react";
import { createTaskAction } from "@/app/(app)/tareas/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";

export type Option = { value: string; label: string };

export function TaskFields({
  defaults = {},
  projects,
  spaces,
  phases,
}: {
  defaults?: Partial<Record<string, string | number | null>>;
  projects: Option[];
  spaces: Option[];
  phases?: Option[];
}) {
  const v = (k: string) => (defaults[k] === null || defaults[k] === undefined ? "" : String(defaults[k]));
  return (
    <>
      <TextField label="Título" name="title" required defaultValue={v("title")} autoFocus maxLength={300} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Fecha" name="dueDate" type="date" defaultValue={v("dueDate")} />
        <TextField label="Hora (opcional)" name="dueTime" type="time" defaultValue={v("dueTime")} />
        <SelectField label="Prioridad" name="priority" defaultValue={v("priority") || "3"} options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: L.priority[p] ?? `P${p}` }))} />
        <SelectField label="Se repite" name="rrule" defaultValue={v("rrule")} options={RECURRENCE_PRESETS.map((r) => ({ value: r.value, label: r.label }))} />
        <SelectField label="Proyecto" name="projectId" defaultValue={v("projectId")} placeholder="Sin proyecto" options={projects} />
        {phases?.length ? <SelectField label="Etapa" name="phaseId" defaultValue={v("phaseId")} placeholder="Sin etapa" options={phases} /> : null}
        <SelectField label="Espacio" name="spaceId" defaultValue={v("spaceId")} options={spaces} hint="Si elegís proyecto, se usa el espacio del proyecto." />
        <TextField label="Estimación (min)" name="estimateMinutes" type="number" inputMode="numeric" min={1} defaultValue={v("estimateMinutes")} />
      </div>
      <TextAreaField label="Descripción (Markdown)" name="descriptionMd" defaultValue={v("descriptionMd")} rows={4} />
    </>
  );
}

export function NewTaskSheet({
  projects,
  spaces,
  defaults,
  trigger,
  openInitially,
}: {
  projects: Option[];
  spaces: Option[];
  defaults?: Partial<Record<string, string | number | null>>;
  trigger?: React.ReactNode;
  openInitially?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(openInitially));
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Nueva tarea" trigger={trigger} wide>
      <ActionForm action={createTaskAction} successMessage="Tarea creada" onSuccess={() => setOpen(false)}>
        <TaskFields projects={projects} spaces={spaces} defaults={defaults} />
        {defaults?.parentTaskId ? <input type="hidden" name="parentTaskId" value={String(defaults.parentTaskId)} /> : null}
        <div className="flex justify-end">
          <SubmitButton>Crear tarea</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}
