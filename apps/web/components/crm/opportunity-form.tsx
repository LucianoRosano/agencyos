"use client";

import { Button, Menu, MenuItem, Sheet } from "@agencyos/ui";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { createOpportunityAction, deleteOpportunityAction, restoreOpportunityAction, updateOpportunityAction } from "@/app/(app)/crm/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

type Opt = { value: string; label: string };
type Defaults = Record<string, string | number | null | undefined>;

function OpportunityFields({ clientId, clients, d = {} }: { clientId?: string; clients?: Opt[]; d?: Defaults }) {
  const v = (k: string) => (d[k] === null || d[k] === undefined ? "" : String(d[k]));
  return (
    <>
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : <SelectField label="Cliente" name="clientId" options={clients ?? []} placeholder="Elegí un cliente" defaultValue={v("clientId")} required />}
      <TextField label="Título" name="title" required defaultValue={v("title")} placeholder="Ej.: Tienda online con Mercado Pago" maxLength={200} />
      <div className="grid grid-cols-[1fr_110px] gap-3 md:grid-cols-[1fr_110px_120px]">
        <TextField label="Valor estimado" name="valueAmount" inputMode="decimal" defaultValue={v("valueAmount")} placeholder="1.500.000" />
        <SelectField label="Moneda" name="valueCurrency" defaultValue={v("valueCurrency") || "ARS"} options={[{ value: "ARS", label: "ARS" }, { value: "USD", label: "USD" }]} />
        <TextField label="Probabilidad %" name="probability" type="number" inputMode="numeric" min={0} max={100} step={5} defaultValue={v("probability") || "20"} className="col-span-2 md:col-span-1" />
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <TextField label="Próxima acción" name="nextAction" defaultValue={v("nextAction")} placeholder="Ej.: llamar para coordinar reunión" />
        <TextField label="Para el" name="nextActionDue" type="date" defaultValue={v("nextActionDue")} hint="Aparece en Hoy." />
      </div>
      <TextField label="Cierre estimado" name="expectedClose" type="date" defaultValue={v("expectedClose")} className="md:max-w-[50%]" />
    </>
  );
}

export function NewOpportunitySheet({ clientId, clients, trigger, openInitially, defaultClientId }: { clientId?: string; clients?: Opt[]; trigger: ReactNode; openInitially?: boolean; defaultClientId?: string }) {
  const [open, setOpen] = useState(Boolean(openInitially));
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Nueva oportunidad" description="Entra al pipeline en «Nuevo»." wide trigger={trigger}>
      <ActionForm action={createOpportunityAction} successMessage="Oportunidad creada" onSuccess={() => setOpen(false)} resetOnSuccess>
        <OpportunityFields clientId={clientId} clients={clients} d={{ clientId: defaultClientId }} />
        <div className="flex justify-end"><SubmitButton>Crear oportunidad</SubmitButton></div>
      </ActionForm>
    </Sheet>
  );
}

export function EditOpportunitySheet({ id, clients, defaults }: { id: string; clients: Opt[]; defaults: Defaults }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Editar oportunidad" wide trigger={<Button variant="secondary"><Pencil className="size-4" /> Editar</Button>}>
      <ActionForm action={updateOpportunityAction.bind(null, id)} successMessage="Oportunidad actualizada" onSuccess={() => setOpen(false)}>
        <OpportunityFields clients={clients} d={defaults} />
        <div className="flex justify-end"><SubmitButton>Guardar</SubmitButton></div>
      </ActionForm>
    </Sheet>
  );
}

export function OpportunityMenu({ id, title }: { id: string; title: string }) {
  const { exec } = useAction();
  const router = useRouter();
  return (
    <Menu trigger={<Button variant="ghost" size="icon" aria-label="Más acciones"><MoreHorizontal className="size-4" /></Button>}>
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          if (!confirm(`¿Mandar «${title}» a la papelera? Sale del pipeline. Restaurable 30 días.`)) return;
          exec(() => deleteOpportunityAction(id), { success: "Oportunidad en la papelera", undo: () => restoreOpportunityAction(id), onDone: () => router.push("/crm/oportunidades") });
        }}
      >
        Eliminar
      </MenuItem>
    </Menu>
  );
}
