"use client";

import { Button, Menu, MenuItem, Sheet } from "@agencyos/ui";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { createOpportunityAction, deleteOpportunityAction, restoreOpportunityAction, updateOpportunityAction } from "@/app/(app)/crm/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { useAction } from "@/components/use-action";

/** Campos del formulario cargados al abrir la hoja (fuera del JS inicial de la ficha). */
const OpportunityFields = dynamic(() => import("./opportunity-fields").then((m) => m.OpportunityFields), {
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-surface-2" />,
});

type Opt = { value: string; label: string };
type Defaults = Record<string, string | number | null | undefined>;

export function NewOpportunitySheet({
  clientId,
  clients,
  trigger,
  openInitially,
  defaultClientId,
}: {
  clientId?: string;
  clients?: Opt[];
  trigger: ReactNode;
  openInitially?: boolean;
  defaultClientId?: string;
}) {
  const [open, setOpen] = useState(Boolean(openInitially));
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Nueva oportunidad" description="Entra al pipeline en «Nuevo»." wide trigger={trigger}>
      <ActionForm action={createOpportunityAction} successMessage="Oportunidad creada" onSuccess={() => setOpen(false)} resetOnSuccess>
        <OpportunityFields clientId={clientId} clients={clients} d={{ clientId: defaultClientId }} />
        <div className="flex justify-end">
          <SubmitButton>Crear oportunidad</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function EditOpportunitySheet({ id, clients, defaults }: { id: string; clients: Opt[]; defaults: Defaults }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Editar oportunidad"
      wide
      trigger={
        <Button variant="secondary">
          <Pencil className="size-4" /> Editar
        </Button>
      }
    >
      <ActionForm action={updateOpportunityAction.bind(null, id)} successMessage="Oportunidad actualizada" onSuccess={() => setOpen(false)}>
        <OpportunityFields clients={clients} d={defaults} />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function OpportunityMenu({ id, title }: { id: string; title: string }) {
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
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          if (!confirm(`¿Mandar «${title}» a la papelera? Sale del pipeline. Restaurable 30 días.`)) return;
          exec(() => deleteOpportunityAction(id), {
            success: "Oportunidad en la papelera",
            undo: () => restoreOpportunityAction(id),
            onDone: () => router.push("/crm/oportunidades"),
          });
        }}
      >
        Eliminar
      </MenuItem>
    </Menu>
  );
}
