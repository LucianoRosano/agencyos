"use client";

import { Button, Sheet } from "@agencyos/ui";
import { Pencil, Plus, Timer, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { createTimeEntryAction, deleteTimeEntryAction, restoreTimeEntryAction, updateTimeEntryAction } from "@/app/(app)/proyectos/time-actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckField, SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

type Opt = { value: string; label: string };

export type TimeRow = {
  id: string;
  date: string;
  dateLabel: string;
  minutes: number;
  durationLabel: string;
  billable: boolean;
  rate: string | null;
  rateLabel: string | null;
  currency: string;
  note: string | null;
  projectId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  userName: string | null;
};

const CURRENCIES = [
  { value: "ARS", label: "ARS" },
  { value: "USD", label: "USD" },
];

function TimeFields({
  projects,
  fixed,
  defaults,
  today,
}: {
  projects?: Opt[];
  fixed: { projectId?: string | null; taskId?: string | null };
  defaults?: Partial<TimeRow>;
  today: string;
}) {
  return (
    <>
      {fixed.taskId ? <input type="hidden" name="taskId" value={fixed.taskId} /> : null}
      {fixed.projectId !== undefined && fixed.projectId !== null ? (
        <input type="hidden" name="projectId" value={fixed.projectId} />
      ) : projects ? (
        <SelectField label="Proyecto" name="projectId" required defaultValue={defaults?.projectId ?? ""} placeholder="Elegí un proyecto" options={projects} />
      ) : null}
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Duración"
          name="duration"
          required
          autoFocus
          inputMode="text"
          defaultValue={defaults?.minutes ? String(defaults.minutes) : ""}
          placeholder="1h30"
          hint="Minutos o 1h30, 1:30, 1,5h"
        />
        <TextField label="Fecha" name="date" type="date" max={today} defaultValue={defaults?.date ?? today} />
      </div>
      <CheckField label="Facturable" name="billable" defaultChecked={defaults?.billable ?? true} hint="Cuenta para la tarifa efectiva del cliente." />
      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-4">
        <TextField label="Tarifa por hora (opcional)" name="rate" inputMode="decimal" defaultValue={defaults?.rate ?? ""} placeholder="25.000" />
        <SelectField label="Moneda" name="currency" defaultValue={defaults?.currency ?? "ARS"} options={CURRENCIES} />
      </div>
      <TextField label="Nota" name="note" maxLength={500} defaultValue={defaults?.note ?? ""} placeholder="Qué hiciste (opcional)" />
    </>
  );
}

/** Registrar horas (o editar un registro) en una hoja. */
export function TimeEntrySheet({
  trigger,
  projects,
  fixed,
  entry,
  today,
}: {
  trigger: ReactNode;
  projects?: Opt[];
  fixed: { projectId?: string | null; taskId?: string | null };
  entry?: TimeRow;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const action = entry ? updateTimeEntryAction.bind(null, entry.id) : createTimeEntryAction;
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={entry ? "Editar registro de horas" : "Registrar horas"}
      description={entry ? undefined : "Lo que registres suma a las horas del proyecto y a su tarifa efectiva."}
      trigger={trigger}
    >
      <ActionForm action={action} successMessage={entry ? "Registro actualizado" : "Horas registradas"} onSuccess={() => setOpen(false)}>
        <TimeFields projects={projects} fixed={entry ? { projectId: entry.projectId, taskId: entry.taskId } : fixed} defaults={entry} today={today} />
        <div className="flex justify-end">
          <SubmitButton>{entry ? "Guardar" : "Registrar"}</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function RegisterTimeButton({
  projects,
  fixed,
  today,
  variant = "primary",
  label = "Registrar horas",
}: {
  projects?: Opt[];
  fixed: { projectId?: string | null; taskId?: string | null };
  today: string;
  variant?: "primary" | "secondary" | "ghost";
  label?: string;
}) {
  return (
    <TimeEntrySheet
      projects={projects}
      fixed={fixed}
      today={today}
      trigger={
        <Button variant={variant} size={variant === "ghost" ? "sm" : "md"}>
          {variant === "ghost" ? <Plus className="size-4" /> : <Timer className="size-4" />} {label}
        </Button>
      }
    />
  );
}

/** Lista de registros: fila en desktop, tarjeta compacta en el celular; editar y eliminar con Deshacer. */
export function TimeEntryList({ rows, today, showTask = true }: { rows: TimeRow[]; today: string; showTask?: boolean }) {
  const { exec } = useAction();
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start gap-3 px-3.5 py-2.5 md:items-center">
          <span className="w-[76px] shrink-0 pt-0.5 font-mono text-[12px] text-text-muted md:pt-0">{r.dateLabel}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] text-text">{showTask && r.taskTitle ? r.taskTitle : (r.note ?? (r.taskTitle || "Sin nota"))}</p>
            <p className="truncate text-[12px] text-text-muted">
              {[showTask && r.taskTitle ? r.note : null, r.billable ? "Facturable" : "No facturable", r.rateLabel, r.userName].filter(Boolean).join(" · ")}
            </p>
          </div>
          <span className="shrink-0 pt-0.5 font-mono text-[13px] text-text md:pt-0">{r.durationLabel}</span>
          <div className="flex shrink-0 items-center">
            <TimeEntrySheet
              entry={r}
              fixed={{}}
              today={today}
              trigger={
                <Button variant="ghost" size="icon" className="max-md:size-11" aria-label={`Editar el registro del ${r.dateLabel}`}>
                  <Pencil className="size-4" />
                </Button>
              }
            />
            <Button
              variant="ghost"
              size="icon"
              className="max-md:size-11"
              aria-label={`Eliminar el registro del ${r.dateLabel}`}
              onClick={() => {
                if (!confirm(`¿Eliminar el registro de ${r.durationLabel} del ${r.dateLabel}?`)) return;
                exec(() => deleteTimeEntryAction(r.id), { success: "Registro en la papelera", undo: () => restoreTimeEntryAction(r.id) });
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
