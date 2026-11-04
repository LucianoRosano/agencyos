"use client";

import { formatDate, formatMoney, subMoney, todayAR } from "@agencyos/core";
import { Button, EmptyState, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { Ban, BriefcaseBusiness, Landmark, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import {
  collectReceivableAction,
  createPayableAction,
  createReceivableAction,
  deletePayableAction,
  deleteReceivableAction,
  deleteTransactionAction,
  payPayableAction,
  restorePayableAction,
  restoreReceivableAction,
  updatePayableAction,
  updateReceivableAction,
  voidPayableAction,
  voidReceivableAction,
} from "@/app/(app)/finanzas/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { CURRENCIES, type FormOptions } from "./shared";
import { useClearParam, useUndoToast } from "./use-deep-link";

export type ReceivableData = {
  id: string;
  clientId: string;
  projectId: string | null;
  concept: string;
  amount: string;
  paidAmount: string;
  currency: string;
  dueDate: string | null;
  status: string;
  clientName?: string | null;
};
export type PayableData = {
  id: string;
  ledgerId: string;
  counterpart: string;
  concept: string;
  amount: string;
  paidAmount: string;
  currency: string;
  dueDate: string | null;
  status: string;
};

// ---------------------------------------------------------------------------
// Por cobrar
// ---------------------------------------------------------------------------
function ReceivableForm({ options, d, onDone }: { options: FormOptions; d?: ReceivableData; onDone: () => void }) {
  if (!options.clients.length && !d) {
    return (
      <EmptyState
        compact
        icon={<BriefcaseBusiness />}
        title="Primero cargá el cliente"
        description="Cada cobro pendiente es de un cliente. Crealo en Clientes y volvé."
        action={
          <Button asChild variant="primary">
            <Link href="/crm/clientes">Ir a Clientes</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ActionForm
      action={d ? updateReceivableAction.bind(null, d.id) : createReceivableAction}
      successMessage={d ? "Cobro actualizado" : "Cobro pendiente agregado"}
      onSuccess={onDone}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField label="Cliente" name="clientId" required defaultValue={d?.clientId ?? ""} placeholder="Elegí el cliente" options={options.clients} />
        <SelectField label="Proyecto" name="projectId" defaultValue={d?.projectId ?? ""} placeholder="Sin proyecto" options={options.projects} />
      </div>
      <TextField label="Concepto" name="concept" required defaultValue={d?.concept} placeholder="Ej.: Sitio web · 50% de anticipo" maxLength={200} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TextField label="Monto" name="amount" required inputMode="decimal" defaultValue={d?.amount} placeholder="0,00" />
        <SelectField label="Moneda" name="currency" defaultValue={d?.currency ?? "ARS"} options={CURRENCIES} />
        <TextField label="Vence" name="dueDate" type="date" defaultValue={d?.dueDate ?? ""} />
      </div>
      <div className="flex justify-end">
        <SubmitButton>{d ? "Guardar" : "Agregar"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function NewReceivableButton({
  options,
  label = "Nuevo cobro",
  variant = "secondary",
}: {
  options: FormOptions;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nuevo cobro pendiente"
      wide
      trigger={
        <Button variant={variant}>
          <Plus className="size-4" /> {label}
        </Button>
      }
    >
      <ReceivableForm options={options} onDone={() => setOpen(false)} />
    </Sheet>
  );
}

/** "Registrar cobro" (total o parcial). Deep link `?cobrar=<id>`. */
export function CollectSheet({
  r,
  options,
  openInitially,
  trigger,
}: {
  r: ReceivableData;
  options: FormOptions;
  openInitially?: boolean;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(openInitially));
  const clear = useClearParam();
  const undo = useUndoToast();
  const remaining = subMoney(r.amount, r.paidAmount);
  const accounts = options.accounts.filter((a) => a.currency === r.currency);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) clear("cobrar");
      }}
      title={`Registrar cobro${r.clientName ? ` · ${r.clientName}` : ""}`}
      description={`${r.concept} · pendiente ${formatMoney(remaining, r.currency)}`}
      trigger={trigger}
    >
      {accounts.length ? (
        <ActionForm
          action={collectReceivableAction.bind(null, r.id)}
          onSuccess={(data: unknown) => {
            const d = data as { transaction: { id: string }; number: string };
            setOpen(false);
            clear("cobrar");
            undo(`Cobro registrado · constancia ${d.number}`, () => deleteTransactionAction(d.transaction.id));
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField
              label={`Monto cobrado (${r.currency})`}
              name="amount"
              required
              inputMode="decimal"
              defaultValue={remaining}
              hint="Podés registrar un cobro parcial."
            />
            <TextField label="Fecha" name="date" type="date" defaultValue={todayAR()} />
            <SelectField
              label="Cuenta donde entró"
              name="accountId"
              required
              options={accounts.map((a) => ({
                value: a.id,
                label: `${a.name} · ${a.currency}`,
              }))}
            />
            <SelectField
              label="Categoría"
              name="categoryId"
              placeholder="Sin categoría"
              options={options.categories.filter((c) => c.kind === "income").map((c) => ({ value: c.id, label: c.label }))}
            />
          </div>
          <div className="flex justify-end">
            <SubmitButton>Registrar cobro</SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <NeedAccount currency={r.currency} />
      )}
    </Sheet>
  );
}

function NeedAccount({ currency }: { currency: string }) {
  return (
    <EmptyState
      compact
      icon={<Landmark />}
      title={`Necesitás una cuenta en ${currency}`}
      description="El movimiento entra o sale de una de tus cuentas. Creala con su saldo inicial y volvé."
      action={
        <Button asChild variant="primary">
          <Link href="/finanzas/cuentas?nueva=1">Crear cuenta</Link>
        </Button>
      }
    />
  );
}

export function ReceivableMenu({ r, options }: { r: ReceivableData; options: FormOptions }) {
  const { exec } = useAction();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label="Acciones del cobro" className="size-11 md:size-9">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
          Editar
        </MenuItem>
        {r.status === "void" ? (
          <MenuItem
            icon={<RotateCcw />}
            onSelect={() =>
              exec(() => voidReceivableAction(r.id, true), {
                success: "Cobro reactivado",
              })
            }
          >
            Reactivar
          </MenuItem>
        ) : r.status !== "paid" ? (
          <MenuItem
            icon={<Ban />}
            onSelect={() =>
              exec(() => voidReceivableAction(r.id), {
                success: "Cobro anulado",
                undo: () => voidReceivableAction(r.id, true),
              })
            }
          >
            Anular
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (!confirm(`¿Mandar el cobro «${r.concept}» a la papelera? Los cobros ya registrados quedan en Movimientos. Restaurable 30 días.`)) return;
            exec(() => deleteReceivableAction(r.id), {
              success: "Cobro en la papelera",
              undo: () => restoreReceivableAction(r.id),
            });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>
      {editing ? (
        <Sheet open onOpenChange={(o) => !o && setEditing(false)} title="Editar cobro" wide>
          <ReceivableForm options={options} d={r} onDone={() => setEditing(false)} />
        </Sheet>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Por pagar
// ---------------------------------------------------------------------------
function PayableForm({ options, d, defaultLedgerId, onDone }: { options: FormOptions; d?: PayableData; defaultLedgerId?: string; onDone: () => void }) {
  return (
    <ActionForm
      action={d ? updatePayableAction.bind(null, d.id) : createPayableAction}
      successMessage={d ? "Pago actualizado" : "Pago pendiente agregado"}
      onSuccess={onDone}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField label="A quién" name="counterpart" required defaultValue={d?.counterpart} placeholder="Proveedor o acreedor" maxLength={160} autoFocus />
        <SelectField
          label="Libro"
          name="ledgerId"
          required
          defaultValue={d?.ledgerId ?? defaultLedgerId ?? options.ledgers[0]?.value}
          options={options.ledgers}
        />
      </div>
      <TextField label="Concepto" name="concept" required defaultValue={d?.concept} placeholder="Ej.: Cuota 3 de 6" maxLength={200} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TextField label="Monto" name="amount" required inputMode="decimal" defaultValue={d?.amount} placeholder="0,00" />
        <SelectField label="Moneda" name="currency" defaultValue={d?.currency ?? "ARS"} options={CURRENCIES} />
        <TextField label="Vence" name="dueDate" type="date" defaultValue={d?.dueDate ?? ""} />
      </div>
      <div className="flex justify-end">
        <SubmitButton>{d ? "Guardar" : "Agregar"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function NewPayableButton({
  options,
  defaultLedgerId,
  label = "Nuevo pago",
  variant = "secondary",
}: {
  options: FormOptions;
  defaultLedgerId?: string;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nuevo pago pendiente"
      wide
      trigger={
        <Button variant={variant}>
          <Plus className="size-4" /> {label}
        </Button>
      }
    >
      <PayableForm options={options} defaultLedgerId={defaultLedgerId} onDone={() => setOpen(false)} />
    </Sheet>
  );
}

/** "Registrar pago" (total o parcial) de una deuda. Deep link `?pagar=<id>`. */
export function PayPayableSheet({
  p,
  options,
  openInitially,
  trigger,
}: {
  p: PayableData;
  options: FormOptions;
  openInitially?: boolean;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(openInitially));
  const clear = useClearParam();
  const undo = useUndoToast();
  const remaining = subMoney(p.amount, p.paidAmount);
  const accounts = options.accounts.filter((a) => a.currency === p.currency);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) clear("pagar");
      }}
      title={`Registrar pago · ${p.counterpart}`}
      description={`${p.concept} · pendiente ${formatMoney(remaining, p.currency)}${p.dueDate ? ` · vence ${formatDate(p.dueDate)}` : ""}`}
      trigger={trigger}
    >
      {accounts.length ? (
        <ActionForm
          action={payPayableAction.bind(null, p.id)}
          onSuccess={(data: unknown) => {
            const d = data as { transaction: { id: string } };
            setOpen(false);
            clear("pagar");
            undo("Pago registrado", () => deleteTransactionAction(d.transaction.id));
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField
              label={`Monto pagado (${p.currency})`}
              name="amount"
              required
              inputMode="decimal"
              defaultValue={remaining}
              hint="Podés registrar un pago parcial."
            />
            <TextField label="Fecha" name="date" type="date" defaultValue={todayAR()} />
            <SelectField
              label="Cuenta de la que sale"
              name="accountId"
              required
              options={accounts.map((a) => ({
                value: a.id,
                label: `${a.name} · ${a.currency}`,
              }))}
            />
            <SelectField
              label="Categoría"
              name="categoryId"
              placeholder="Sin categoría"
              options={options.categories.filter((c) => c.kind === "expense").map((c) => ({ value: c.id, label: c.label }))}
            />
          </div>
          <div className="flex justify-end">
            <SubmitButton>Registrar pago</SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <NeedAccount currency={p.currency} />
      )}
    </Sheet>
  );
}

export function PayableMenu({ p, options }: { p: PayableData; options: FormOptions }) {
  const { exec } = useAction();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label="Acciones del pago" className="size-11 md:size-9">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
          Editar
        </MenuItem>
        {p.status === "void" ? (
          <MenuItem
            icon={<RotateCcw />}
            onSelect={() =>
              exec(() => voidPayableAction(p.id, true), {
                success: "Pago reactivado",
              })
            }
          >
            Reactivar
          </MenuItem>
        ) : p.status !== "paid" ? (
          <MenuItem
            icon={<Ban />}
            onSelect={() =>
              exec(() => voidPayableAction(p.id), {
                success: "Pago anulado",
                undo: () => voidPayableAction(p.id, true),
              })
            }
          >
            Anular
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (!confirm(`¿Mandar «${p.concept}» a la papelera? Los pagos ya registrados quedan en Movimientos. Restaurable 30 días.`)) return;
            exec(() => deletePayableAction(p.id), {
              success: "Pago en la papelera",
              undo: () => restorePayableAction(p.id),
            });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>
      {editing ? (
        <Sheet open onOpenChange={(o) => !o && setEditing(false)} title="Editar pago" wide>
          <PayableForm options={options} d={p} onDone={() => setEditing(false)} />
        </Sheet>
      ) : null}
    </>
  );
}
