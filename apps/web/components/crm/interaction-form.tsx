"use client";

import { L } from "@agencyos/core";
import { Button, cn, Menu, MenuItem, Sheet } from "@agencyos/ui";
import { Check, MoreHorizontal, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  completeNextStepAction,
  deleteInteractionAction,
  logInteractionAction,
  restoreInteractionAction,
  restoreNextStepAction,
} from "@/app/(app)/crm/actions";
import { ActionForm, SubmitButton, useFieldError } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { KIND_ICON } from "./icons";

type Opt = { value: string; label: string };

function KindPicker({ defaultValue = "whatsapp" }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  const error = useFieldError("kind");
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-text-muted">Tipo</legend>
      <div className="grid grid-cols-3 gap-1.5 md:grid-cols-6">
        {Object.entries(L.interactionKind).map(([k, l]) => (
          <label
            key={k}
            className={cn(
              "flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] border text-[13px] transition-colors [&>svg]:size-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
              value === k ? "border-accent-2/60 bg-accent-2/10 text-text" : "border-border text-text-muted hover:text-text",
            )}
          >
            <input type="radio" name="kind" value={k} checked={value === k} onChange={() => setValue(k)} className="sr-only" />
            {KIND_ICON[k]}
            {l}
          </label>
        ))}
      </div>
      {error ? (
        <p className="mt-1 text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Registro rápido: tipo, fecha/hora, contacto, resumen y próximo paso. */
export function InteractionForm({
  clientId,
  clients,
  contacts,
  now,
  onDone,
  compact,
  defaultContactId,
}: {
  clientId?: string;
  clients?: Opt[];
  contacts: Opt[];
  now: { date: string; time: string };
  onDone?: () => void;
  compact?: boolean;
  defaultContactId?: string;
}) {
  return (
    <ActionForm action={logInteractionAction} successMessage="Interacción registrada" resetOnSuccess onSuccess={() => onDone?.()}>
      {clientId ? (
        <input type="hidden" name="clientId" value={clientId} />
      ) : (
        <SelectField label="Cliente" name="clientId" options={clients ?? []} placeholder="Elegí un cliente" required />
      )}
      <KindPicker />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_120px_1.4fr]">
        <TextField label="Fecha" name="date" type="date" defaultValue={now.date} />
        <TextField label="Hora" name="time" type="time" defaultValue={now.time} />
        {contacts.length ? (
          <SelectField
            label="Contacto"
            name="contactId"
            options={contacts}
            placeholder="Sin contacto"
            defaultValue={defaultContactId}
            className="col-span-2 md:col-span-1"
          />
        ) : null}
      </div>
      <TextAreaField label="Resumen (Markdown)" name="summaryMd" required rows={compact ? 3 : 4} placeholder="¿Qué se habló? ¿Qué quedó acordado?" />
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <TextField label="Próximo paso" name="nextStep" placeholder="Opcional · ej.: mandar propuesta" />
        <TextField label="Para el" name="nextStepDue" type="date" hint="Aparece en Hoy ese día." />
      </div>
      <div className="flex justify-end">
        <SubmitButton>Registrar</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function InteractionSheet({
  trigger,
  ...props
}: {
  trigger: ReactNode;
  clientId?: string;
  clients?: Opt[];
  contacts: Opt[];
  now: { date: string; time: string };
  defaultContactId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen} title="Registrar interacción" wide trigger={trigger}>
      <InteractionForm {...props} onDone={() => setOpen(false)} />
    </Sheet>
  );
}

export function NextStepDone({ id, text, due }: { id: string; text: string; due: string | null }) {
  const { exec, pending } = useAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      aria-label={`Marcar hecho: ${text}`}
      onClick={() =>
        exec(() => completeNextStepAction(id), {
          success: "Próximo paso hecho",
          undo: () => restoreNextStepAction(id, text, due),
        })
      }
      className="h-9 shrink-0"
    >
      <Check className="size-4" /> Hecho
    </Button>
  );
}

export function InteractionMenu({ id }: { id: string }) {
  const { exec } = useAction();
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon" aria-label="Acciones de la interacción" className="size-9">
          <MoreHorizontal className="size-4" />
        </Button>
      }
    >
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          if (!confirm("¿Mandar esta interacción a la papelera? Restaurable 30 días.")) return;
          exec(() => deleteInteractionAction(id), { success: "Interacción en la papelera", undo: () => restoreInteractionAction(id) });
        }}
      >
        Eliminar
      </MenuItem>
    </Menu>
  );
}
