"use client";

import { formatDate, L } from "@agencyos/core";
import { Button, cn, Sheet } from "@agencyos/ui";
import { Plus } from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";
import { createReminderAction } from "@/app/(app)/calendario/actions";
import { createTaskAction } from "@/app/(app)/tareas/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckField, SelectField, TextAreaField, TextField } from "@/components/fields";
import { type Option, TaskFields } from "@/components/tasks/task-form";

type Mode = "task" | "reminder";
const Ctx = createContext<(date: string) => void>(() => {});

/**
 * Un solo Sheet de alta para todo el calendario: tarea en un día (createTask) o
 * recordatorio/vencimiento (createReminder). Los días llaman a `open(fecha)`.
 */
export function CalendarCreateProvider({ children, projects, spaces, today }: { children: ReactNode; projects: Option[]; spaces: Option[]; today: string }) {
  const [state, setState] = useState<{ open: boolean; date: string; mode: Mode }>({ open: false, date: today, mode: "task" });
  const open = (date: string) => setState({ open: true, date, mode: "task" });
  const close = () => setState((s) => ({ ...s, open: false }));
  return (
    <Ctx.Provider value={open}>
      {children}
      <Sheet open={state.open} onOpenChange={(o) => (o ? undefined : close())} title={`Nuevo · ${formatDate(state.date)}`} wide>
        <div role="tablist" aria-label="Qué querés crear" className="mb-4 grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-border bg-bg-elevated p-1">
          {(["task", "reminder"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={state.mode === m}
              onClick={() => setState((s) => ({ ...s, mode: m }))}
              className={cn("h-10 rounded-md text-sm transition-colors", state.mode === m ? "bg-surface-3 text-text" : "text-text-muted hover:text-text")}
            >
              {m === "task" ? "Tarea" : "Vencimiento"}
            </button>
          ))}
        </div>
        {state.mode === "task" ? (
          <ActionForm key={`t-${state.date}`} action={createTaskAction} successMessage="Tarea creada" onSuccess={close}>
            <TaskFields projects={projects} spaces={spaces} defaults={{ dueDate: state.date }} />
            <div className="flex justify-end"><SubmitButton>Crear tarea</SubmitButton></div>
          </ActionForm>
        ) : (
          <ActionForm key={`r-${state.date}`} action={createReminderAction} successMessage="Vencimiento agendado" onSuccess={close}>
            <TextField label="Título" name="title" required autoFocus maxLength={200} placeholder="Ej.: Renovar dominio de un cliente" />
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Vence el" name="dueDate" type="date" required defaultValue={state.date} />
              <SelectField label="Tipo" name="kind" defaultValue="deadline" options={Object.entries(L.reminderKind).map(([value, label]) => ({ value, label }))} />
              <TextField label="Avisar días antes" name="notifyDaysBefore" type="number" inputMode="numeric" min={0} max={365} defaultValue="7" hint="Aparece en «Ponerse al día» de Hoy." />
            </div>
            <CheckField label="Se repite cada año" name="recurring" hint="Al marcarlo hecho, se agenda el del año siguiente." />
            <TextAreaField label="Notas (opcional)" name="notesMd" rows={3} />
            <div className="flex justify-end"><SubmitButton>Agendar</SubmitButton></div>
          </ActionForm>
        )}
      </Sheet>
    </Ctx.Provider>
  );
}

export function AddOnDayButton({ date, className, label = "Agregar" }: { date: string; className?: string; label?: string }) {
  const open = useContext(Ctx);
  return (
    <button
      type="button"
      onClick={() => open(date)}
      aria-label={`${label} el ${formatDate(date)}`}
      className={cn("grid size-8 shrink-0 place-items-center rounded-md text-text-faint transition-colors hover:bg-surface-2 hover:text-text focus-visible:text-text", className)}
    >
      <Plus className="size-4" />
    </button>
  );
}

export function NewEventButton({ date }: { date: string }) {
  const open = useContext(Ctx);
  return (
    <Button variant="primary" onClick={() => open(date)}>
      <Plus className="size-4" /> Nuevo
    </Button>
  );
}
