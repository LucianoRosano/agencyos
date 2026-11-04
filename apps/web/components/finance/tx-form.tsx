"use client";

import { todayAR } from "@agencyos/core";
import { Button, cn, EmptyState, Sheet } from "@agencyos/ui";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Landmark } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { createTransactionAction, createTransferAction, deleteTransactionAction, updateTransactionAction } from "@/app/(app)/finanzas/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import type { AccountOpt, FormOptions } from "./shared";
import { useClearParam, useUndoToast } from "./use-deep-link";

export type TxKind = "income" | "expense" | "transfer";
export type TxDefaults = Partial<{
  id: string;
  kind: string;
  date: string;
  amount: string;
  accountId: string;
  exchangeRate: string | null;
  categoryId: string | null;
  clientId: string | null;
  projectId: string | null;
  counterpart: string | null;
  description: string | null;
}>;

const KINDS: { key: TxKind; label: string; icon: ReactNode }[] = [
  { key: "expense", label: "Gasto", icon: <ArrowUpRight className="size-4" /> },
  {
    key: "income",
    label: "Ingreso",
    icon: <ArrowDownLeft className="size-4" />,
  },
  {
    key: "transfer",
    label: "Transferencia",
    icon: <ArrowLeftRight className="size-4" />,
  },
];

export const accountLabel = (a: AccountOpt) => `${a.name} · ${a.currency}${a.ledgerName ? ` · ${a.ledgerName}` : ""}`;
const v = (x: string | null | undefined) => x ?? "";

/** Hoja para registrar o editar un movimiento (ingreso, gasto o transferencia). */
export function TransactionSheet({
  options,
  trigger,
  open: openProp,
  onOpenChange,
  defaults,
  defaultAccountId,
  openInitially,
}: {
  options: FormOptions;
  openInitially?: boolean;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  defaults?: TxDefaults;
  defaultAccountId?: string;
}) {
  const [inner, setInner] = useState(Boolean(openInitially));
  const open = openProp ?? inner;
  const clear = useClearParam();
  const setOpen = (o: boolean) => {
    (onOpenChange ?? setInner)(o);
    if (!o) clear("nuevo");
  };
  const editing = Boolean(defaults?.id);
  const [kind, setKind] = useState<TxKind>((defaults?.kind as TxKind) ?? "expense");
  return (
    <Sheet open={open} onOpenChange={setOpen} title={editing ? "Editar movimiento" : "Registrar movimiento"} trigger={trigger} wide>
      {options.accounts.length === 0 ? (
        <EmptyState
          compact
          icon={<Landmark />}
          title="Primero creá una cuenta"
          description="Cada movimiento sale o entra de una cuenta: efectivo, banco, Mercado Pago o dólares."
          action={
            <Button asChild variant="primary">
              <Link href="/finanzas/cuentas?nueva=1">Crear cuenta</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {!editing ? (
            <div
              role="radiogroup"
              aria-label="Tipo de movimiento"
              className="grid grid-cols-3 gap-1 rounded-[var(--radius-control)] border border-border bg-bg-elevated p-1"
            >
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.key}
                  onClick={() => setKind(k.key)}
                  className={cn(
                    "flex h-10 items-center justify-center gap-1.5 rounded-md text-[14px] transition-colors",
                    kind === k.key ? "bg-surface-2 font-medium text-text shadow-[inset_0_0_0_1px_var(--border)]" : "text-text-muted hover:text-text",
                  )}
                >
                  <span className={kind === k.key ? (k.key === "income" ? "text-success" : k.key === "expense" ? "text-danger" : "text-accent-2") : undefined}>
                    {k.icon}
                  </span>
                  <span className="truncate">{k.label}</span>
                </button>
              ))}
            </div>
          ) : null}
          {kind === "transfer" ? (
            <TransferForm key="transfer" options={options} onDone={() => setOpen(false)} defaultAccountId={defaultAccountId} />
          ) : (
            <IncomeExpenseForm key={kind} kind={kind} options={options} defaults={defaults} defaultAccountId={defaultAccountId} onDone={() => setOpen(false)} />
          )}
        </div>
      )}
    </Sheet>
  );
}

function IncomeExpenseForm({
  kind,
  options,
  defaults,
  defaultAccountId,
  onDone,
}: {
  kind: "income" | "expense";
  options: FormOptions;
  defaults?: TxDefaults;
  defaultAccountId?: string;
  onDone: () => void;
}) {
  const undo = useUndoToast();
  const [accountId, setAccountId] = useState(defaults?.accountId ?? defaultAccountId ?? options.accounts[0]?.id ?? "");
  const account = options.accounts.find((a) => a.id === accountId);
  const cats = options.categories.filter((c) => c.kind === kind);
  const id = defaults?.id;
  return (
    <ActionForm
      action={id ? updateTransactionAction.bind(null, id) : createTransactionAction}
      successMessage={id ? "Movimiento actualizado" : undefined}
      onSuccess={(row: unknown) => {
        onDone();
        if (!id) undo(kind === "income" ? "Ingreso registrado" : "Gasto registrado", () => deleteTransactionAction((row as { id: string }).id));
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField
          label={`Monto${account ? ` (${account.currency})` : ""}`}
          name="amount"
          required
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          defaultValue={v(defaults?.amount)}
          autoFocus
        />
        <TextField label="Fecha" name="date" type="date" defaultValue={defaults?.date ?? todayAR()} />
        <SelectField
          label="Cuenta"
          name="accountId"
          required
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={options.accounts.map((a) => ({
            value: a.id,
            label: accountLabel(a),
          }))}
          hint="La moneda es la de la cuenta."
        />
        <SelectField
          label="Categoría"
          name="categoryId"
          defaultValue={v(defaults?.categoryId)}
          placeholder="Sin categoría"
          options={cats.map((c) => ({ value: c.id, label: c.label }))}
        />
        <SelectField label="Cliente" name="clientId" defaultValue={v(defaults?.clientId)} placeholder="Sin cliente" options={options.clients} />
        <SelectField label="Proyecto" name="projectId" defaultValue={v(defaults?.projectId)} placeholder="Sin proyecto" options={options.projects} />
        <TextField label={kind === "income" ? "Quién pagó" : "A quién"} name="counterpart" defaultValue={v(defaults?.counterpart)} maxLength={160} />
        <TextField
          label="Cotización (opcional)"
          name="exchangeRate"
          inputMode="decimal"
          placeholder="ARS por US$ 1"
          defaultValue={v(defaults?.exchangeRate)}
          hint="Pesos por dólar. Solo se usa para convertir en reportes."
        />
      </div>
      <TextField
        label="Descripción"
        name="description"
        defaultValue={v(defaults?.description)}
        maxLength={500}
        placeholder={kind === "income" ? "Ej.: Mantenimiento de octubre" : "Ej.: Teclado"}
      />
      <div className="flex justify-end">
        <SubmitButton>{id ? "Guardar" : kind === "income" ? "Registrar ingreso" : "Registrar gasto"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function TransferForm({ options, defaultAccountId, onDone }: { options: FormOptions; defaultAccountId?: string; onDone: () => void }) {
  const undo = useUndoToast();
  const first = defaultAccountId ?? options.accounts[0]?.id ?? "";
  const [fromId, setFromId] = useState(first);
  const [toId, setToId] = useState(options.accounts.find((a) => a.id !== first)?.id ?? "");
  const from = options.accounts.find((a) => a.id === fromId);
  const to = options.accounts.find((a) => a.id === toId);
  const differ = from && to && from.currency !== to.currency;
  const accs = options.accounts.map((a) => ({
    value: a.id,
    label: accountLabel(a),
  }));
  if (options.accounts.length < 2) {
    return (
      <EmptyState
        compact
        icon={<ArrowLeftRight />}
        title="Necesitás al menos dos cuentas"
        description="Una transferencia mueve plata de una cuenta a otra (por ejemplo, de Mercado Pago al banco)."
        action={
          <Button asChild>
            <Link href="/finanzas/cuentas?nueva=1">Crear cuenta</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ActionForm
      action={createTransferAction}
      onSuccess={(data: unknown) => {
        onDone();
        const first = (data as { rows: { id: string }[] }).rows[0];
        if (first) undo("Transferencia registrada", () => deleteTransactionAction(first.id));
      }}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField label="Desde" name="fromAccountId" required value={fromId} onChange={(e) => setFromId(e.target.value)} options={accs} />
        <SelectField
          label="Hacia"
          name="toAccountId"
          required
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          placeholder="Elegí la cuenta"
          options={accs.filter((a) => a.value !== fromId)}
        />
        <TextField
          label={`Monto${from ? ` (${from.currency})` : ""}`}
          name="amount"
          required
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          autoFocus
        />
        {differ ? (
          <TextField
            label={`Llega (${to?.currency})`}
            name="toAmount"
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            hint="Las cuentas tienen distinta moneda: indicá cuánto se acredita."
          />
        ) : null}
        <TextField label="Fecha" name="date" type="date" defaultValue={todayAR()} />
      </div>
      <TextField label="Descripción" name="description" maxLength={500} placeholder="Ej.: Paso a la cuenta del banco" />
      <div className="flex justify-end">
        <SubmitButton>Registrar transferencia</SubmitButton>
      </div>
    </ActionForm>
  );
}
