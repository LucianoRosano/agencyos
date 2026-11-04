"use client";

import { L } from "@agencyos/core";
import { Button, Sheet } from "@agencyos/ui";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { createClientAction, updateClientAction } from "@/app/(app)/crm/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { opts } from "./shared";

type Opt = { value: string; label: string };
type Defaults = Record<string, string | null | undefined>;

function ClientFields({ spaces, d = {} }: { spaces: Opt[]; d?: Defaults }) {
  const v = (k: string) => d[k] ?? "";
  return (
    <>
      <TextField label="Nombre" name="name" required defaultValue={v("name")} autoFocus={!d.name} maxLength={160} placeholder="Ej.: Bellezatecnia" />
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Estado" name="status" defaultValue={v("status") || "prospect"} options={opts(L.clientStatus)} />
        <SelectField label="Relación" name="relationship" defaultValue={v("relationship") || "external"} options={opts(L.relationship)} />
        <TextField label="Nombre comercial" name="tradeName" defaultValue={v("tradeName")} />
        <TextField label="Rubro" name="industry" defaultValue={v("industry")} placeholder="Ej.: Estética" />
        <TextField label="Sitio web" name="website" defaultValue={v("website")} inputMode="url" placeholder="ejemplo.com.ar" />
        <TextField label="Origen" name="source" defaultValue={v("source")} placeholder="Referido, Instagram, web…" />
        <TextField label="Ciudad" name="city" defaultValue={v("city")} />
        <TextField label="Provincia" name="province" defaultValue={v("province")} />
        <SelectField
          label="Espacio"
          name="spaceId"
          defaultValue={v("spaceId")}
          options={spaces}
          placeholder={d.spaceId ? undefined : "Agencia (por defecto)"}
        />
      </div>
      <TextAreaField label="Notas internas (Markdown)" name="notesMd" defaultValue={v("notesMd")} rows={5} className="font-mono" />
    </>
  );
}

/** Alta de cliente con contacto principal opcional: un solo paso para el flujo prospecto → proyecto. */
export function NewClientForm({ spaces }: { spaces: Opt[] }) {
  return (
    <ActionForm action={createClientAction} successMessage="Cliente creado" redirectTo={(c) => `/crm/clientes/${(c as { id: string }).id}`}>
      <ClientFields spaces={spaces} />
      <fieldset className="flex flex-col gap-4 rounded-[10px] border border-border p-4">
        <legend className="px-1 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">Contacto principal (opcional)</legend>
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
