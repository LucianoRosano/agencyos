"use client";

import { formatDate, L } from "@agencyos/core";
import { Button, Menu, MenuItem, MenuSeparator, Select, Sheet } from "@agencyos/ui";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import {
  addBlockerAction,
  addChangelogAction,
  addDecisionAction,
  addDeliverableAction,
  addPhaseAction,
  archiveProjectAction,
  deleteProjectAction,
  resolveBlockerAction,
  restoreProjectAction,
  saveAsTemplateAction,
  setDeliverableStatusAction,
  setNextActionAction,
  setPhaseStatusAction,
  setProjectStatusAction,
  unarchiveProjectAction,
  updateProjectAction,
} from "../../actions";

type Opt = { value: string; label: string };
const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

export function EditProjectSheet({
  id,
  spaces,
  clients,
  defaults,
}: {
  id: string;
  spaces: Opt[];
  clients: Opt[];
  defaults: Record<string, string | number | null>;
}) {
  const [open, setOpen] = useState(false);
  const v = (k: string) => (defaults[k] === null || defaults[k] === undefined ? "" : String(defaults[k]));
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Editar proyecto"
      wide
      trigger={
        <Button variant="secondary">
          <Pencil className="size-4" /> Editar
        </Button>
      }
    >
      <ActionForm action={updateProjectAction.bind(null, id)} successMessage="Proyecto actualizado" onSuccess={() => setOpen(false)}>
        <TextField label="Nombre" name="name" required defaultValue={v("name")} />
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label="Estado" name="status" defaultValue={v("status")} options={opts(L.projectStatus)} />
          <SelectField label="Tipo" name="kind" defaultValue={v("kind")} options={opts(L.projectKind)} />
          <SelectField label="Cliente" name="clientId" defaultValue={v("clientId")} placeholder="Sin cliente" options={clients} />
          <SelectField label="Espacio" name="spaceId" defaultValue={v("spaceId")} options={spaces} />
          <SelectField
            label="Prioridad"
            name="priority"
            defaultValue={v("priority")}
            options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: L.priority[p] ?? "" }))}
          />
          <TextField label="Inicio" name="startDate" type="date" defaultValue={v("startDate")} />
          <TextField label="Fecha objetivo" name="targetDate" type="date" defaultValue={v("targetDate")} />
          <TextField label="Entrega real" name="deliveredDate" type="date" defaultValue={v("deliveredDate")} />
        </div>
        <TextField label="Objetivo en una frase" name="goal" defaultValue={v("goal")} maxLength={300} />
        <TextField label="Siguiente acción" name="nextAction" defaultValue={v("nextAction")} hint="Obligatoria si está en curso." />
        <TextAreaField label="Definición de terminado" name="definitionOfDone" defaultValue={v("definitionOfDone")} rows={3} />
        <TextAreaField label="Notas (Markdown)" name="notesMd" defaultValue={v("notesMd")} rows={8} className="font-mono" />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function ProjectMenu({ id, name, status, archived }: { id: string; name: string; status: string; archived: boolean }) {
  const { exec } = useAction();
  const router = useRouter();
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon" aria-label="Más acciones">
          <MoreHorizontal className="size-4" />
        </Button>
      }
    >
      {(["in_progress", "paused", "blocked", "done"] as const)
        .filter((s) => s !== status)
        .map((s) => (
          <MenuItem
            key={s}
            onSelect={() =>
              exec(() => setProjectStatusAction(id, s), {
                success: `Proyecto: ${L.projectStatus[s].toLowerCase()}`,
                undo: () => setProjectStatusAction(id, status as "in_progress"),
              })
            }
          >
            Pasar a {L.projectStatus[s].toLowerCase()}
          </MenuItem>
        ))}
      <MenuSeparator />
      <MenuItem
        onSelect={() => {
          const n = prompt("Nombre de la plantilla", `Plantilla: ${name}`);
          if (n) exec(() => saveAsTemplateAction(id, n), { success: "Plantilla guardada" });
        }}
      >
        Guardar como plantilla
      </MenuItem>
      <MenuItem
        onSelect={() =>
          exec(() => (archived ? unarchiveProjectAction(id) : archiveProjectAction(id)), {
            success: archived ? "Desarchivado" : "Archivado",
            undo: () => (archived ? archiveProjectAction(id) : unarchiveProjectAction(id)),
          })
        }
      >
        {archived ? "Desarchivar" : "Archivar"}
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          if (!confirm(`¿Mandar «${name}» a la papelera? Las tareas quedan, pero el proyecto desaparece de las listas. Restaurable 30 días.`)) return;
          exec(() => deleteProjectAction(id), {
            success: "Proyecto en la papelera",
            undo: () => restoreProjectAction(id),
            onDone: () => router.push("/proyectos"),
          });
        }}
      >
        Eliminar
      </MenuItem>
    </Menu>
  );
}

export function NextActionForm({ id }: { id: string }) {
  return (
    <ActionForm
      action={setNextActionAction.bind(null, id)}
      successMessage="Siguiente acción definida (también quedó como tarea para hoy)"
      resetOnSuccess
      className="flex-row items-end gap-2"
    >
      <TextField label="Nueva siguiente acción" name="nextAction" className="flex-1" placeholder="¿Qué es lo próximo concreto?" />
      <SubmitButton variant="secondary">Definir</SubmitButton>
    </ActionForm>
  );
}

export function BlockerList({
  projectId,
  blockers,
  formOnly,
}: {
  projectId: string;
  blockers: { id: string; waitingFor: string; revisitOn: string | null }[];
  formOnly?: boolean;
}) {
  const { exec } = useAction();
  if (formOnly) {
    return (
      <ActionForm action={addBlockerAction.bind(null, projectId)} successMessage="Bloqueo registrado" resetOnSuccess>
        <TextField label="Esperando a…" name="waitingFor" placeholder="Ej.: fotos del cliente" />
        <TextField label="Volver a revisar el" name="revisitOn" type="date" hint="Aparece en Hoy esa fecha." />
        <SubmitButton variant="secondary">Registrar bloqueo</SubmitButton>
      </ActionForm>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {blockers.map((b) => (
        <li key={b.id} className="flex items-center gap-3 text-[14px]">
          <span className="flex-1 text-text">
            Esperando a {b.waitingFor} <span className="font-mono text-[12px] text-text-muted">· revisar {formatDate(b.revisitOn)}</span>
          </span>
          <Button size="sm" onClick={() => exec(() => resolveBlockerAction(b.id), { success: "Bloqueo resuelto" })}>
            Resuelto
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function PhaseStatus({ id, status }: { id: string; status: string }) {
  const { exec } = useAction();
  return (
    <Select
      aria-label="Estado de la etapa"
      defaultValue={status}
      onChange={(e) => exec(() => setPhaseStatusAction(id, e.target.value as "done"), { success: "Etapa actualizada" })}
      className="md:w-40"
    >
      {Object.entries(L.phaseStatus).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </Select>
  );
}

export function PhaseForm({ projectId }: { projectId: string }) {
  return (
    <ActionForm action={addPhaseAction.bind(null, projectId)} successMessage="Etapa agregada" resetOnSuccess className="md:flex-row md:items-end">
      <TextField label="Nueva etapa" name="name" className="flex-1" />
      <TextField label="Vence" name="dueDate" type="date" />
      <SubmitButton variant="secondary">Agregar</SubmitButton>
    </ActionForm>
  );
}

export function DeliverableStatus({ id, status }: { id: string; status: string }) {
  const { exec } = useAction();
  return (
    <Select
      aria-label="Estado de la entrega"
      defaultValue={status}
      onChange={(e) => exec(() => setDeliverableStatusAction(id, e.target.value as "approved"), { success: "Entrega actualizada" })}
      className="md:w-44"
    >
      {Object.entries(L.deliverableStatus).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </Select>
  );
}

export function DeliverableForm({ projectId }: { projectId: string }) {
  return (
    <ActionForm action={addDeliverableAction.bind(null, projectId)} successMessage="Entrega agregada" resetOnSuccess>
      <div className="grid gap-4 md:grid-cols-[1fr_200px]">
        <TextField label="Nueva entrega" name="title" />
        <TextField label="Fecha" name="dueDate" type="date" />
      </div>
      <TextAreaField label="Contenido (opcional)" name="contentMd" rows={2} />
      <SubmitButton variant="secondary" className="self-end">
        Agregar entrega
      </SubmitButton>
    </ActionForm>
  );
}

export function DecisionForm({ projectId }: { projectId: string }) {
  return (
    <ActionForm action={addDecisionAction.bind(null, projectId)} successMessage="Decisión registrada" resetOnSuccess>
      <TextField label="Qué se decidió" name="title" required />
      <TextAreaField label="Por qué (Markdown)" name="rationaleMd" rows={4} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Fecha" name="decidedOn" type="date" />
        <TextField label="Aprobó" name="approvedBy" placeholder="Luciano" />
      </div>
      <SubmitButton variant="secondary">Registrar decisión</SubmitButton>
    </ActionForm>
  );
}

export function ChangelogForm({ projectId }: { projectId: string }) {
  return (
    <ActionForm action={addChangelogAction.bind(null, projectId)} successMessage="Entrada agregada" resetOnSuccess>
      <TextField label="Título" name="title" required />
      <TextField label="Versión (opcional)" name="version" placeholder="v1.2.0" />
      <TextAreaField label="Detalle (Markdown)" name="bodyMd" rows={3} />
      <SubmitButton variant="secondary">Agregar al changelog</SubmitButton>
    </ActionForm>
  );
}
