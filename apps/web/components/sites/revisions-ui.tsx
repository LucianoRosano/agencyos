"use client";

import { L } from "@agencyos/core";
import { Button, Select, Sheet } from "@agencyos/ui";
import { CircleCheckBig, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { addRevisionItemAction, closeRoundAction, openRoundAction, setRevisionItemStatusAction, updateRevisionItemAction } from "@/app/(app)/sitios/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { opts } from "./shared";

type Item = { id: string; pageRef: string | null; description: string; priority: number; status: string; assignee: string | null };

export function OpenRoundButton({ siteId, next, primary = true }: { siteId: string; next: number; primary?: boolean }) {
  const { exec, pending } = useAction();
  return (
    <Button variant={primary ? "primary" : "secondary"} loading={pending} onClick={() => exec(() => openRoundAction(siteId), { success: `Ronda R${next} abierta` })}>
      <Plus className="size-4" /> Abrir ronda R{next}
    </Button>
  );
}

export function CloseRoundButton({ roundId, number }: { roundId: string; number: number }) {
  const { exec, pending } = useAction();
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() => {
        if (!confirm(`¿Cerrar la ronda R${number}? Después no se pueden agregar ni cambiar ítems.`)) return;
        exec(() => closeRoundAction(roundId), { success: `Ronda R${number} cerrada` });
      }}
    >
      <CircleCheckBig className="size-4" /> Cerrar R{number}
    </Button>
  );
}

function ItemFields({ item, pages }: { item?: Item; pages: string[] }) {
  return (
    <>
      <TextAreaField label="Qué hay que cambiar" name="description" required defaultValue={item?.description} rows={3} maxLength={4000} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Página" name="pageRef" defaultValue={item?.pageRef ?? ""} list="revision-pages" placeholder="Ej.: Inicio" maxLength={160} />
        <datalist id="revision-pages">
          {pages.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <SelectField
          label="Prioridad"
          name="priority"
          defaultValue={String(item?.priority ?? 3)}
          options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: L.priority[p] ?? `P${p}` }))}
        />
        <SelectField label="Responsable" name="assignee" defaultValue={item?.assignee ?? "user"} placeholder="Sin asignar" options={opts(L.siteAssignee)} />
        {item ? <SelectField label="Estado" name="status" defaultValue={item.status} options={opts(L.revisionItemStatus)} /> : null}
      </div>
    </>
  );
}

export function NewItemSheet({ roundId, number, pages }: { roundId: string; number: number; pages: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={`Nuevo ítem en R${number}`}
      wide
      trigger={
        <Button variant="primary">
          <Plus className="size-4" /> Agregar ítem
        </Button>
      }
    >
      <ActionForm action={addRevisionItemAction.bind(null, roundId)} successMessage="Ítem agregado" onSuccess={() => setOpen(false)}>
        <ItemFields pages={pages} />
        <div className="flex justify-end">
          <SubmitButton>Agregar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function EditItemSheet({ item, pages }: { item: Item; pages: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Editar ítem"
      wide
      trigger={
        <Button variant="ghost" size="icon" aria-label="Editar ítem">
          <Pencil className="size-4" />
        </Button>
      }
    >
      <ActionForm action={updateRevisionItemAction.bind(null, item.id)} successMessage="Ítem actualizado" onSuccess={() => setOpen(false)}>
        <ItemFields item={item} pages={pages} />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function ItemStatusSelect({ id, status }: { id: string; status: string }) {
  const { exec } = useAction();
  return (
    <Select
      aria-label="Estado del ítem"
      defaultValue={status}
      onChange={(e) => {
        const next = e.target.value;
        exec(() => setRevisionItemStatusAction(id, next), {
          success: `Ítem: ${L.revisionItemStatus[next as keyof typeof L.revisionItemStatus].toLowerCase()}`,
          undo: () => setRevisionItemStatusAction(id, status),
        });
      }}
      className="w-full sm:w-36"
    >
      {Object.entries(L.revisionItemStatus).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </Select>
  );
}
