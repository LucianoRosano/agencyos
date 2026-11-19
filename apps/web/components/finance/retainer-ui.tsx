"use client";

import { Button, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { MoreHorizontal, Pause, Pencil, Play, Plus, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import {
  createRetainerAction,
  deleteRetainerAction,
  restoreRetainerAction,
  setRetainerStatusAction,
  updateRetainerAction,
} from "@/app/(app)/finanzas/abonos/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

type Opt = { value: string; label: string };
export type RetainerData = {
  id: string;
  clientId: string;
  projectId: string | null;
  concept: string;
  amount: string;
  currency: string;
  hoursIncluded: string | null;
  billingDay: number;
  dueDays: number;
  startDate: string;
  endDate: string | null;
  notesMd: string | null;
  status: string;
};

function RetainerFields({ clients, projects, d = {} }: { clients: Opt[]; projects: Opt[]; d?: Partial<RetainerData> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SelectField label="Cliente" name="clientId" required defaultValue={d.clientId ?? ""} placeholder="Elegí el cliente" options={clients} />
      <SelectField
        label="Proyecto (opcional)"
        name="projectId"
        defaultValue={d.projectId ?? ""}
        placeholder="Sin proyecto"
        options={projects}
        hint="Las horas incluidas se cuentan sobre este proyecto (o sobre todos los del cliente)."
      />
      <TextField
        label="Concepto"
        name="concept"
        required
        maxLength={160}
        defaultValue={d.concept ?? ""}
        placeholder="Mantenimiento web mensual"
        className="md:col-span-2"
      />
      <TextField label="Monto por mes" name="amount" required inputMode="decimal" defaultValue={d.amount?.replace(/\.00$/, "") ?? ""} placeholder="45.000" />
      <SelectField
        label="Moneda"
        name="currency"
        defaultValue={d.currency ?? "ARS"}
        options={[
          { value: "ARS", label: "ARS" },
          { value: "USD", label: "USD" },
        ]}
      />
      <TextField
        label="Día de facturación"
        name="billingDay"
        type="number"
        min={1}
        max={28}
        required
        defaultValue={String(d.billingDay ?? 1)}
        hint="Del 1 al 28."
      />
      <TextField label="Vence a los (días)" name="dueDays" type="number" min={0} max={90} defaultValue={String(d.dueDays ?? 10)} />
      <TextField
        label="Horas incluidas por mes (opcional)"
        name="hoursIncluded"
        inputMode="decimal"
        defaultValue={d.hoursIncluded?.replace(/\.00$/, "") ?? ""}
        placeholder="5"
      />
      <TextField label="Inicio" name="startDate" type="date" defaultValue={d.startDate ?? ""} />
      <TextField label="Fin (opcional)" name="endDate" type="date" defaultValue={d.endDate ?? ""} />
      <TextAreaField label="Notas" name="notesMd" rows={2} defaultValue={d.notesMd ?? ""} className="md:col-span-2" />
    </div>
  );
}

export function NewRetainerButton({
  clients,
  projects,
  defaultClientId,
  label = "Nuevo abono",
  variant = "secondary",
}: {
  clients: Opt[];
  projects: Opt[];
  defaultClientId?: string;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nuevo abono mensual"
      description="Cada mes, el día de facturación, se genera solo el cobro en «Por cobrar»."
      wide
      trigger={
        <Button variant={variant}>
          <Plus className="size-4" /> {label}
        </Button>
      }
    >
      <ActionForm action={createRetainerAction} successMessage="Abono creado" onSuccess={() => setOpen(false)}>
        <RetainerFields clients={clients} projects={projects} d={{ clientId: defaultClientId }} />
        <div className="flex justify-end">
          <SubmitButton>Crear abono</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function RetainerMenu({ r, clients, projects }: { r: RetainerData; clients: Opt[]; projects: Opt[] }) {
  const { exec } = useAction();
  const [editing, setEditing] = useState(false);
  const status = (s: "active" | "paused" | "cancelled", msg: string) =>
    exec(() => setRetainerStatusAction(r.id, s), { success: msg, undo: () => setRetainerStatusAction(r.id, r.status as "active") });
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label={`Acciones de ${r.concept}`} className="size-11 md:size-9">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
          Editar
        </MenuItem>
        {r.status !== "active" ? (
          <MenuItem icon={<Play />} onSelect={() => status("active", "Abono activo")}>
            Reanudar
          </MenuItem>
        ) : (
          <MenuItem icon={<Pause />} onSelect={() => status("paused", "Abono en pausa: no genera cobros")}>
            Pausar
          </MenuItem>
        )}
        {r.status !== "cancelled" ? (
          <MenuItem icon={<XCircle />} onSelect={() => status("cancelled", "Abono dado de baja")}>
            Dar de baja
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (!confirm(`¿Mandar «${r.concept}» a la papelera? Los cobros ya generados quedan en «Por cobrar». Restaurable 30 días.`)) return;
            exec(() => deleteRetainerAction(r.id), { success: "Abono en la papelera", undo: () => restoreRetainerAction(r.id) });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>
      {editing ? (
        <Sheet open onOpenChange={(o) => !o && setEditing(false)} title={`Editar ${r.concept}`} wide>
          <ActionForm action={updateRetainerAction.bind(null, r.id)} successMessage="Abono actualizado" onSuccess={() => setEditing(false)}>
            <RetainerFields clients={clients} projects={projects} d={r} />
            <div className="flex justify-end">
              <SubmitButton>Guardar</SubmitButton>
            </div>
          </ActionForm>
        </Sheet>
      ) : null}
    </>
  );
}
