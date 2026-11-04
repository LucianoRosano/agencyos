"use client";

import { L, todayAR } from "@agencyos/core";
import { Badge, Button, Card, Select } from "@agencyos/ui";
import { CalendarPlus, FileText, FolderPlus, Trash2, Wallet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { deleteItemAction, discardAction, restoreItemAction, setSpaceAction, toNoteAction, toProjectAction, toTaskAction, undoProcessAction } from "./actions";

type Item = { id: string; text: string; suggestedType: string | null; source: string; spaceId: string | null; createdAt: Date };
type Opt = { value: string; label: string };

/** Procesar la Bandeja uno por uno (docs/02 N4). */
export function Processor({ items, spaces, projects, financeEnabled }: { items: Item[]; spaces: Opt[]; projects: Opt[]; financeEnabled: boolean }) {
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<"choose" | "task">("choose");
  const { exec, pending } = useAction();
  const router = useRouter();
  const item = items[idx];
  const next = () => {
    setMode("choose");
    if (idx + 1 >= items.length) router.push("/bandeja");
    else setIdx(idx + 1);
  };
  if (!item) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between font-mono text-[12px] text-text-muted">
        <span>{idx + 1} de {items.length}</span>
        <button type="button" onClick={() => router.push("/bandeja")} className="flex items-center gap-1 hover:text-text"><X className="size-4" /> Salir</button>
      </div>
      <Card className="p-5 md:p-6">
        {item.suggestedType ? <Badge tone="info" className="mb-3">{L.inboxType[item.suggestedType as keyof typeof L.inboxType] ?? item.suggestedType}</Badge> : null}
        <p className="whitespace-pre-wrap break-words text-[18px] leading-relaxed text-text">{item.text}</p>
        <div className="mt-4 max-w-xs">
          <Select aria-label="Espacio" defaultValue={item.spaceId ?? ""} onChange={(e) => exec(() => setSpaceAction(item.id, e.target.value), { success: "Espacio asignado" })}>
            <option value="" disabled>Asignar espacio…</option>
            {spaces.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </div>
      </Card>
      {mode === "task" ? (
        <Card className="p-5">
          <ActionForm action={toTaskAction.bind(null, item.id)} successMessage="Convertido en tarea" onSuccess={next}>
            <TextField label="Título" name="title" defaultValue={item.text.split("\n")[0]?.slice(0, 300)} required />
            <div className="grid gap-4 md:grid-cols-3">
              <TextField label="Fecha" name="dueDate" type="date" defaultValue={todayAR()} />
              <SelectField label="Proyecto" name="projectId" placeholder="Sin proyecto" options={projects} />
              <SelectField label="Prioridad" name="priority" defaultValue="3" options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: L.priority[p] ?? "" }))} />
            </div>
            <input type="hidden" name="descriptionMd" value={item.text} />
            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setMode("choose")}>Volver</Button>
              <SubmitButton>Crear tarea</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Button size="lg" variant="primary" onClick={() => setMode("task")}><CalendarPlus className="size-4" /> Tarea</Button>
          <Button size="lg" loading={pending} onClick={() => exec(() => toNoteAction(item.id), { success: "Convertido en nota", onDone: next })}><FileText className="size-4" /> Nota / idea</Button>
          <Button size="lg" loading={pending} onClick={() => exec(() => toProjectAction(item.id), { success: "Proyecto creado (idea)", onDone: next })}><FolderPlus className="size-4" /> Proyecto</Button>
          {financeEnabled ? (
            <Button size="lg" onClick={() => exec(() => discardAction(item.id), { onDone: () => router.push("/finanzas/movimientos?nuevo=1") })}><Wallet className="size-4" /> Gasto</Button>
          ) : null}
          <Button size="lg" variant="ghost" loading={pending} onClick={() => exec(() => discardAction(item.id), { success: "Archivado como procesado", undo: () => undoProcessAction(item.id), onDone: next })}>Listo / descartar</Button>
          <Button size="lg" variant="danger" loading={pending} onClick={() => { if (confirm("¿Eliminar este ítem? Queda 30 días en la papelera.")) exec(() => deleteItemAction(item.id), { success: "Eliminado", undo: () => restoreItemAction(item.id), onDone: next }); }}><Trash2 className="size-4" /> Eliminar</Button>
        </div>
      )}
    </div>
  );
}
