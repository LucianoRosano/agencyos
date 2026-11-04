"use client";

import { Button, Checkbox, Input, Menu, MenuItem, MenuSeparator } from "@agencyos/ui";
import { MoreHorizontal, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { type Option, TaskFields } from "@/components/tasks/task-form";
import { useAction } from "@/components/use-action";
import {
  addChecklistAction, convertToProjectAction, deleteTaskAction, removeChecklistAction, restoreTaskAction,
  setTaskStatusAction, toggleChecklistAction, updateTaskAction,
} from "../actions";

export function TaskEditForm({ id, projects, spaces, phases, defaults }: { id: string; projects: Option[]; spaces: Option[]; phases: Option[]; defaults: Record<string, string | number | null> }) {
  return (
    <ActionForm action={updateTaskAction.bind(null, id)} successMessage="Cambios guardados">
      <TaskFields projects={projects} spaces={spaces} phases={phases} defaults={defaults} />
      <div className="flex justify-end">
        <SubmitButton>Guardar</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function TaskActions({ id, status, title }: { id: string; status: string; title: string }) {
  const { exec, pending } = useAction();
  const router = useRouter();
  const done = status === "done";
  return (
    <>
      <Button variant={done ? "secondary" : "primary"} loading={pending} onClick={() => exec(() => setTaskStatusAction(id, done ? "todo" : "done"), { success: done ? "Reabierta" : "Completada", undo: () => setTaskStatusAction(id, status as "todo") })}>
        {done ? "Reabrir" : "Completar"}
      </Button>
      <Menu trigger={<Button variant="ghost" size="icon" aria-label="Más acciones"><MoreHorizontal className="size-4" /></Button>}>
        <MenuItem onSelect={() => exec(() => setTaskStatusAction(id, "doing"), { success: "En curso" })}>Marcar en curso</MenuItem>
        <MenuItem onSelect={() => exec(() => setTaskStatusAction(id, "waiting"), { success: "Esperando" })}>Marcar esperando</MenuItem>
        <MenuItem onSelect={() => exec(() => setTaskStatusAction(id, "cancelled"), { success: "Cancelada", undo: () => setTaskStatusAction(id, status as "todo") })}>Cancelar tarea</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => exec(() => convertToProjectAction(id), { success: "Convertida en proyecto", onDone: (p) => router.push(`/proyectos/${(p as { id: string }).id}`) })}>Convertir en proyecto</MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (!confirm(`¿Mandar «${title}» a la papelera? Podés restaurarla durante 30 días.`)) return;
            exec(() => deleteTaskAction(id), { success: "Enviada a la papelera", undo: () => restoreTaskAction(id), redirectTo: "/tareas" });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>
    </>
  );
}

export function Checklist({ taskId, items }: { taskId: string; items: { id: string; text: string; done: boolean }[] }) {
  const { exec } = useAction();
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-1">
      {items.map((it) => (
        <div key={it.id} className="group flex min-h-11 items-center gap-3">
          <Checkbox checked={it.done} onChange={() => exec(() => toggleChecklistAction(it.id))} aria-label={it.text} className="size-5" />
          <span className={it.done ? "flex-1 text-text-faint line-through" : "flex-1 text-text"}>{it.text}</span>
          <button type="button" aria-label={`Quitar «${it.text}»`} className="grid size-9 place-items-center rounded-md text-text-faint hover:text-danger md:opacity-0 md:group-hover:opacity-100" onClick={() => exec(() => removeChecklistAction(it.id))}>
            <X className="size-4" />
          </button>
        </div>
      ))}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          exec(() => addChecklistAction(taskId, text), { onDone: () => setText("") });
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Agregar ítem…" aria-label="Nuevo ítem de checklist" />
        <Button type="submit">Agregar</Button>
      </form>
    </div>
  );
}
