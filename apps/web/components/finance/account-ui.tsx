"use client";

import { L, todayAR } from "@agencyos/core";
import { Button, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { createAccountAction, deleteAccountAction, restoreAccountAction, updateAccountAction } from "@/app/(app)/finanzas/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { CURRENCIES, type Opt, opts } from "./shared";
import { useClearParam } from "./use-deep-link";

type AccountDefaults = Partial<Record<"id" | "name" | "ledgerId" | "kind" | "currency" | "openingBalance" | "openingDate", string>>;

export function AccountSheet({ ledgers, defaults, trigger, openInitially }: { ledgers: Opt[]; defaults?: AccountDefaults; trigger?: ReactNode; openInitially?: boolean }) {
  const [open, setOpen] = useState(Boolean(openInitially));
  const clear = useClearParam();
  const id = defaults?.id;
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) clear("nueva");
      }}
      title={id ? "Editar cuenta" : "Nueva cuenta"}
      description={id ? undefined : "Efectivo, banco, Mercado Pago o dólares. El saldo actual se calcula desde el saldo inicial."}
      trigger={trigger}
    >
      <ActionForm action={id ? updateAccountAction.bind(null, id) : createAccountAction} successMessage={id ? "Cuenta actualizada" : "Cuenta creada"} onSuccess={() => setOpen(false)}>
        <TextField label="Nombre" name="name" required defaultValue={defaults?.name} placeholder="Ej.: Mercado Pago" autoFocus maxLength={80} />
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label="Tipo" name="kind" defaultValue={defaults?.kind ?? "cash"} options={opts(L.accountKind)} />
          <SelectField label="Moneda" name="currency" defaultValue={defaults?.currency ?? "ARS"} options={CURRENCIES} />
          <SelectField label="Libro" name="ledgerId" required defaultValue={defaults?.ledgerId ?? ledgers[0]?.value} options={ledgers} />
          <TextField label="Saldo inicial" name="openingBalance" inputMode="decimal" defaultValue={defaults?.openingBalance ?? ""} placeholder="0,00" />
          <TextField label="Fecha del saldo inicial" name="openingDate" type="date" defaultValue={defaults?.openingDate ?? todayAR()} />
        </div>
        <div className="flex justify-end">
          <SubmitButton>{id ? "Guardar" : "Crear cuenta"}</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function NewAccountButton({
  ledgers,
  defaultLedgerId,
  openInitially,
  label = "Nueva cuenta",
  variant = "primary",
}: {
  ledgers: Opt[];
  defaultLedgerId?: string;
  openInitially?: boolean;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <AccountSheet
      ledgers={ledgers}
      defaults={{ ledgerId: defaultLedgerId }}
      openInitially={openInitially}
      trigger={
        <Button variant={variant}>
          <Plus className="size-4" /> {label}
        </Button>
      }
    />
  );
}

export function AccountMenu({ account, ledgers }: { account: Required<Omit<AccountDefaults, never>> & { movements: number }; ledgers: Opt[] }) {
  const { exec } = useAction();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label={`Acciones de ${account.name}`} className="size-11 md:size-9">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
          Editar
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            const extra = account.movements ? ` Tiene ${account.movements} movimiento(s): quedan en la lista, pero la cuenta deja de sumar en los saldos.` : "";
            if (!confirm(`¿Mandar la cuenta «${account.name}» a la papelera?${extra} Restaurable 30 días.`)) return;
            exec(() => deleteAccountAction(account.id), {
              success: "Cuenta en la papelera",
              undo: () => restoreAccountAction(account.id),
            });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>
      {editing ? <EditAccount account={account} ledgers={ledgers} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

function EditAccount({ account, ledgers, onClose }: { account: AccountDefaults; ledgers: Opt[]; onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) onClose();
      }}
      title="Editar cuenta"
    >
      <ActionForm action={updateAccountAction.bind(null, account.id as string)} successMessage="Cuenta actualizada" onSuccess={onClose}>
        <TextField label="Nombre" name="name" required defaultValue={account.name} maxLength={80} />
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label="Tipo" name="kind" defaultValue={account.kind} options={opts(L.accountKind)} />
          <SelectField label="Moneda" name="currency" defaultValue={account.currency} options={CURRENCIES} />
          <SelectField label="Libro" name="ledgerId" defaultValue={account.ledgerId} options={ledgers} />
          <TextField label="Saldo inicial" name="openingBalance" inputMode="decimal" defaultValue={account.openingBalance} />
          <TextField label="Fecha del saldo inicial" name="openingDate" type="date" defaultValue={account.openingDate} />
        </div>
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}
