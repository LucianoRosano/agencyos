"use client";

import { formatDate, formatMoney, L, todayAR } from "@agencyos/core";
import { Button, EmptyState, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { Landmark, MoreHorizontal, Pause, Pencil, Play, Plus, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import {
  createSubscriptionAction,
  deleteSubscriptionAction,
  paySubscriptionAction,
  restoreSubscriptionAction,
  setSubscriptionStatusAction,
  undoSubscriptionPaymentAction,
  updateSubscriptionAction,
} from "@/app/(app)/finanzas/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { type AccountOpt, CURRENCIES, type FormOptions, opts } from "./shared";
import { useClearParam, useUndoToast } from "./use-deep-link";

export type SubData = {
  id: string;
  ledgerId: string;
  vendor: string;
  description: string | null;
  amount: string;
  currency: string;
  frequency: string;
  intervalCount: number;
  nextDue: string;
  accountId: string | null;
  categoryId: string | null;
  notifyDaysBefore: number;
  status: string;
};

function SubscriptionFields({ options, d }: { options: FormOptions; d?: Partial<SubData> }) {
  const [currency, setCurrency] = useState(d?.currency ?? "ARS");
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField label="Proveedor" name="vendor" required defaultValue={d?.vendor} placeholder="Ej.: Hostinger" autoFocus maxLength={120} />
        <TextField label="Detalle (opcional)" name="description" defaultValue={d?.description ?? ""} placeholder="Ej.: VPS KVM 2" maxLength={300} />
        <TextField label="Monto" name="amount" required inputMode="decimal" defaultValue={d?.amount} placeholder="0,00" />
        <SelectField label="Moneda" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} options={CURRENCIES} />
        <SelectField label="Frecuencia" name="frequency" defaultValue={d?.frequency ?? "monthly"} options={opts(L.frequency)} />
        <TextField
          label="Cada cuántos períodos"
          name="intervalCount"
          type="number"
          inputMode="numeric"
          min={1}
          max={36}
          defaultValue={String(d?.intervalCount ?? 1)}
          hint="1 = todos los meses (o semanas/años)."
        />
        <TextField label="Próximo vencimiento" name="nextDue" type="date" required defaultValue={d?.nextDue ?? todayAR()} />
        <TextField
          label="Avisar días antes"
          name="notifyDaysBefore"
          type="number"
          inputMode="numeric"
          min={0}
          max={60}
          defaultValue={String(d?.notifyDaysBefore ?? 3)}
          hint="Aparece en «Ponerse al día» de Hoy."
        />
        <SelectField
          label="Cuenta con la que pagás"
          name="accountId"
          defaultValue={d?.accountId ?? ""}
          placeholder="Elegir al pagar"
          options={options.accounts.filter((a) => a.currency === currency).map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))}
        />
        <SelectField
          label="Categoría"
          name="categoryId"
          defaultValue={d?.categoryId ?? ""}
          placeholder="Sin categoría"
          options={options.categories.filter((c) => c.kind === "expense").map((c) => ({ value: c.id, label: c.label }))}
        />
        <SelectField label="Libro" name="ledgerId" required defaultValue={d?.ledgerId ?? options.ledgers[0]?.value} options={options.ledgers} />
        <SelectField label="Estado" name="status" defaultValue={d?.status ?? "active"} options={opts(L.subscriptionStatus)} />
      </div>
    </>
  );
}

export function NewSubscriptionButton({
  options,
  defaultLedgerId,
  label = "Nueva suscripción",
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
      title="Nueva suscripción o gasto fijo"
      wide
      trigger={
        <Button variant={variant}>
          <Plus className="size-4" /> {label}
        </Button>
      }
    >
      <ActionForm action={createSubscriptionAction} successMessage="Suscripción agregada" onSuccess={() => setOpen(false)}>
        <SubscriptionFields options={options} d={{ ledgerId: defaultLedgerId }} />
        <div className="flex justify-end">
          <SubmitButton>Agregar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

function EditSubscription({ sub, options, onClose }: { sub: SubData; options: FormOptions; onClose: () => void }) {
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} title={`Editar ${sub.vendor}`} wide>
      <ActionForm action={updateSubscriptionAction.bind(null, sub.id)} successMessage="Suscripción actualizada" onSuccess={onClose}>
        <SubscriptionFields options={options} d={sub} />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

/** "Registrar pago": crea el gasto y avanza la próxima fecha, con Deshacer. Se abre también por deep link `?pagar=<id>`. */
export function PaySubscriptionSheet({
  sub,
  accounts,
  openInitially,
  trigger,
}: {
  sub: SubData;
  accounts: AccountOpt[];
  openInitially?: boolean;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(openInitially));
  const clear = useClearParam();
  const undo = useUndoToast();
  const valid = accounts.filter((a) => a.currency === sub.currency);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) clear("pagar");
      }}
      title={`Registrar pago · ${sub.vendor}`}
      description={`Vence el ${formatDate(sub.nextDue)} · ${formatMoney(sub.amount, sub.currency)}`}
      trigger={trigger}
    >
      {valid.length ? (
        <ActionForm
          action={paySubscriptionAction.bind(null, sub.id)}
          onSuccess={(data: unknown) => {
            const d = data as {
              transaction: { id: string };
              previousDue: string;
              nextDue: string;
            };
            setOpen(false);
            clear("pagar");
            undo(`Pago registrado · próximo vencimiento ${formatDate(d.nextDue)}`, () =>
              undoSubscriptionPaymentAction(sub.id, d.transaction.id, d.previousDue),
            );
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label={`Monto (${sub.currency})`} name="amount" required inputMode="decimal" defaultValue={sub.amount} />
            <TextField label="Fecha del pago" name="date" type="date" defaultValue={todayAR()} />
          </div>
          <SelectField
            label="Cuenta"
            name="accountId"
            required
            defaultValue={sub.accountId && valid.some((a) => a.id === sub.accountId) ? sub.accountId : valid[0]?.id}
            options={valid.map((a) => ({
              value: a.id,
              label: `${a.name} · ${a.currency}`,
            }))}
          />
          <p className="text-[13px] text-text-muted">Se registra un gasto y la próxima fecha pasa al siguiente período.</p>
          <div className="flex justify-end">
            <SubmitButton>Registrar pago</SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <EmptyState
          compact
          icon={<Landmark />}
          title={`Necesitás una cuenta en ${sub.currency}`}
          description="El pago sale de una de tus cuentas. Creala con su saldo inicial y volvé."
          action={
            <Button asChild variant="primary">
              <Link href="/finanzas/cuentas?nueva=1">Crear cuenta</Link>
            </Button>
          }
        />
      )}
    </Sheet>
  );
}

export function SubscriptionMenu({ sub, options }: { sub: SubData; options: FormOptions }) {
  const { exec } = useAction();
  const [editing, setEditing] = useState(false);
  const status = (s: "active" | "paused" | "cancelled", msg: string) =>
    exec(() => setSubscriptionStatusAction(sub.id, s), {
      success: msg,
      undo: () => setSubscriptionStatusAction(sub.id, sub.status as "active"),
    });
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label={`Acciones de ${sub.vendor}`} className="size-11 md:size-9">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
          Editar
        </MenuItem>
        {sub.status !== "active" ? (
          <MenuItem icon={<Play />} onSelect={() => status("active", "Suscripción activa")}>
            Activar
          </MenuItem>
        ) : null}
        {sub.status === "active" ? (
          <MenuItem icon={<Pause />} onSelect={() => status("paused", "Suscripción en pausa")}>
            Pausar
          </MenuItem>
        ) : null}
        {sub.status !== "cancelled" ? (
          <MenuItem icon={<XCircle />} onSelect={() => status("cancelled", "Suscripción cancelada")}>
            Cancelar suscripción
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (!confirm(`¿Mandar «${sub.vendor}» a la papelera? Los pagos ya registrados quedan en Movimientos. Restaurable 30 días.`)) return;
            exec(() => deleteSubscriptionAction(sub.id), {
              success: "Suscripción en la papelera",
              undo: () => restoreSubscriptionAction(sub.id),
            });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>
      {editing ? <EditSubscription sub={sub} options={options} onClose={() => setEditing(false)} /> : null}
    </>
  );
}
