"use client";

import { L } from "@agencyos/core";
import { Button, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { createServiceAction, deleteServiceAction, restoreServiceAction, setServiceActiveAction, updateServiceAction } from "@/app/(app)/presupuestos/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckField, SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

type Opt = { value: string; label: string };
export type ServiceDefaults = { name: string; unit: string; priceArs: string | null; priceUsd: string | null; projectTemplateId: string | null; descriptionMd: string | null; deliverablesMd: string | null; active: boolean };

const plain = (v: string | null) => (v ? v.replace(/\.00$/, "") : "");

function ServiceFields({ templates, d }: { templates: Opt[]; d?: ServiceDefaults }) {
  return (
    <>
      <TextField label="Nombre" name="name" required defaultValue={d?.name ?? ""} maxLength={160} autoFocus placeholder="Ej.: Tienda online con WooCommerce" />
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Unidad" name="unit" defaultValue={d?.unit ?? "project"} options={Object.entries(L.serviceUnit).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Plantilla de proyecto" name="projectTemplateId" defaultValue={d?.projectTemplateId ?? ""} placeholder="Sin plantilla (usa «En blanco»)" options={templates} hint="Se usa al aceptar un presupuesto con este servicio." />
        <TextField label="Precio de referencia ARS" name="priceArs" inputMode="decimal" defaultValue={plain(d?.priceArs ?? null)} placeholder="Opcional" />
        <TextField label="Precio de referencia USD" name="priceUsd" inputMode="decimal" defaultValue={plain(d?.priceUsd ?? null)} placeholder="Opcional" />
      </div>
      <TextAreaField label="Descripción (Markdown)" name="descriptionMd" rows={3} defaultValue={d?.descriptionMd ?? ""} />
      <TextAreaField label="Entregables (Markdown)" name="deliverablesMd" rows={4} defaultValue={d?.deliverablesMd ?? ""} placeholder={"- Sitio publicado\n- Manual de uso"} />
      <input type="hidden" name="active" value="false" />
      <CheckField name="active" label="Activo" hint="Solo los activos aparecen en el editor de presupuestos." defaultChecked={d ? d.active : true} />
    </>
  );
}

export function NewServiceSheet({ templates, trigger }: { templates: Opt[]; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Nuevo servicio" wide trigger={trigger ?? <Button variant="primary"><Plus className="size-4" /> Nuevo servicio</Button>}>
      <ActionForm action={createServiceAction} successMessage="Servicio agregado al catálogo" onSuccess={() => setOpen(false)}>
        <ServiceFields templates={templates} />
        <div className="flex justify-end">
          <SubmitButton>Guardar servicio</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function ServiceActions({ id, templates, d }: { id: string; templates: Opt[]; d: ServiceDefaults }) {
  const [open, setOpen] = useState(false);
  const { exec } = useAction();
  return (
    <>
      <Sheet open={open} onOpenChange={setOpen} title="Editar servicio" wide>
        <ActionForm action={updateServiceAction.bind(null, id)} successMessage="Servicio actualizado" onSuccess={() => setOpen(false)}>
          <ServiceFields templates={templates} d={d} />
          <div className="flex justify-end">
            <SubmitButton>Guardar</SubmitButton>
          </div>
        </ActionForm>
      </Sheet>
      <Menu trigger={<Button variant="ghost" size="icon" aria-label={`Acciones de ${d.name}`}><MoreHorizontal className="size-4" /></Button>}>
        <MenuItem icon={<Pencil />} onSelect={() => setOpen(true)}>
          Editar
        </MenuItem>
        <MenuItem onSelect={() => exec(() => setServiceActiveAction(id, !d.active), { success: d.active ? "Servicio desactivado" : "Servicio activado", undo: () => setServiceActiveAction(id, d.active) })}>
          {d.active ? "Desactivar" : "Activar"}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (!confirm(`¿Mandar «${d.name}» a la papelera? Los presupuestos que lo usan no cambian.`)) return;
            exec(() => deleteServiceAction(id), { success: "Servicio en la papelera", undo: () => restoreServiceAction(id) });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>
    </>
  );
}
