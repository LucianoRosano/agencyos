"use client";

import { Button, Sheet } from "@agencyos/ui";
import { Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { createClientAction, updateClientAction } from "@/app/(app)/crm/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TextField } from "@/components/fields";

/** Campos del formulario cargados al abrir la hoja (fuera del JS inicial de la ficha). */
const ClientFields = dynamic(() => import("./client-fields").then((m) => m.ClientFields), {
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-surface-2" />,
});

type Opt = { value: string; label: string };
type Defaults = Record<string, string | null | undefined>;

/** Alta de cliente con contacto principal opcional: un solo paso para el flujo prospecto → proyecto. */
export function NewClientForm({ spaces }: { spaces: Opt[] }) {
  return (
    <ActionForm action={createClientAction} successMessage="Cliente creado" redirectTo={(c) => `/crm/clientes/${(c as { id: string }).id}`}>
      <ClientFields spaces={spaces} />
      <fieldset className="flex flex-col gap-4 rounded-[10px] border border-border p-4">
        <legend className="px-1 font-mono text-[11px] uppercase tracking-[0.04em] text-text-muted">Contacto principal (opcional)</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Nombre del contacto" name="contactName" placeholder="Ej.: Sofía" />
          <TextField label="Rol" name="contactRole" placeholder="Dueña, encargado…" />
          <TextField label="Email" name="contactEmail" type="email" inputMode="email" autoComplete="off" />
          <TextField label="Teléfono / WhatsApp" name="contactPhone" type="tel" inputMode="tel" placeholder="+54 9 341 555-1234" />
        </div>
      </fieldset>
      <div className="flex justify-end">
        <SubmitButton>Crear cliente</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function EditClientSheet({ id, spaces, defaults }: { id: string; spaces: Opt[]; defaults: Defaults }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Editar cliente"
      wide
      trigger={
        <Button variant="secondary">
          <Pencil className="size-4" /> Editar
        </Button>
      }
    >
      <ActionForm action={updateClientAction.bind(null, id)} successMessage="Cliente actualizado" onSuccess={() => setOpen(false)}>
        <ClientFields spaces={spaces} d={defaults} />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}
