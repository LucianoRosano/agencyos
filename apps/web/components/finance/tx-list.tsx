"use client";

import { formatDate } from "@agencyos/core";
import { Button, EntityChip, Menu, MenuItem, MenuSeparator } from "@agencyos/ui";
import { ArrowLeftRight, FileText, MoreHorizontal, Pencil, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteTransactionAction, restoreTransactionAction } from "@/app/(app)/finanzas/actions";
import { useAction } from "@/components/use-action";
import { Amount, type FormOptions } from "./shared";
import { TransactionSheet, type TxDefaults } from "./tx-form";

export type TxItem = {
  id: string;
  kind: string;
  date: string;
  amount: string;
  currency: string;
  exchangeRate: string | null;
  description: string | null;
  counterpart: string | null;
  accountId: string;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  parentCategoryName: string | null;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  ledgerName: string | null;
  receivableId: string | null;
  payableId: string | null;
  subscriptionId: string | null;
  transferPairId: string | null;
  pairAccountName: string | null;
};

function title(t: TxItem) {
  if (t.kind === "transfer_out") return `Transferencia a ${t.pairAccountName ?? t.counterpart ?? "otra cuenta"}`;
  if (t.kind === "transfer_in") return `Transferencia desde ${t.pairAccountName ?? t.counterpart ?? "otra cuenta"}`;
  return t.description || t.counterpart || (t.kind === "income" ? "Ingreso" : "Gasto");
}
const catName = (t: TxItem) => (t.categoryName ? (t.parentCategoryName ? `${t.parentCategoryName} › ${t.categoryName}` : t.categoryName) : null);

/** Lista de movimientos: tabla en desktop, tarjetas en el celular. */
export function TransactionList({ items, options, showLedger }: { items: TxItem[]; options: FormOptions; showLedger?: boolean }) {
  const [editing, setEditing] = useState<TxDefaults | null>(null);
  return (
    <>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        <table className="hidden w-full text-[14px] md:table">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
              <th className="w-28 px-4 py-3 font-normal">Fecha</th>
              <th className="px-4 py-3 font-normal">Detalle</th>
              <th className="px-4 py-3 font-normal">Categoría</th>
              <th className="px-4 py-3 font-normal">Cuenta</th>
              <th className="px-4 py-3 text-right font-normal">Monto</th>
              <th className="w-12 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-2/50" data-tx={t.id}>
                <td className="px-4 py-3 font-mono text-[13px] text-text-muted tabular-nums">{formatDate(t.date)}</td>
                <td className="max-w-0 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <KindIcon t={t} />
                    <span className="truncate text-text">{title(t)}</span>
                  </div>
                  {t.clientName || t.projectName || (t.counterpart && t.description) ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-6">
                      {t.counterpart && t.description && !t.kind.startsWith("transfer") ? <span className="text-[12px] text-text-faint">{t.counterpart}</span> : null}
                      {t.clientName ? <EntityChip color="#22D3EE">{t.clientName}</EntityChip> : null}
                      {t.projectName ? <EntityChip color="#7C5CFF">{t.projectName}</EntityChip> : null}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-[13px] text-text-muted">{catName(t) ?? <span className="text-text-faint">—</span>}</td>
                <td className="px-4 py-3 text-[13px] text-text-muted">
                  {t.accountName}
                  {showLedger && t.ledgerName ? <span className="block font-mono text-[11px] text-text-faint">{t.ledgerName}</span> : null}
                </td>
                <td className="px-4 py-3 text-right">
                  <Amount value={t.amount} currency={t.currency} kind={t.kind} />
                </td>
                <td className="px-2 py-2 text-right">
                  <RowMenu t={t} onEdit={() => setEditing(toDefaults(t))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="divide-y divide-border md:hidden">
          {items.map((t) => (
            <li key={t.id} className="flex items-start gap-3 px-4 py-3" data-tx={t.id}>
              <div className="mt-0.5">
                <KindIcon t={t} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 truncate text-[15px] text-text">{title(t)}</span>
                  <Amount value={t.amount} currency={t.currency} kind={t.kind} className="text-[15px]" />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-muted">
                  <span className="font-mono tabular-nums">{formatDate(t.date)}</span>
                  <span aria-hidden>·</span>
                  <span>{t.accountName}</span>
                  {catName(t) ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="truncate">{catName(t)}</span>
                    </>
                  ) : null}
                </div>
                {t.clientName || t.projectName ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {t.clientName ? <EntityChip color="#22D3EE">{t.clientName}</EntityChip> : null}
                    {t.projectName ? <EntityChip color="#7C5CFF">{t.projectName}</EntityChip> : null}
                  </div>
                ) : null}
              </div>
              <RowMenu t={t} onEdit={() => setEditing(toDefaults(t))} />
            </li>
          ))}
        </ul>
      </div>
      {editing ? <TransactionSheet key={editing.id} options={options} defaults={editing} open onOpenChange={(o) => !o && setEditing(null)} /> : null}
    </>
  );
}

function toDefaults(t: TxItem): TxDefaults {
  return {
    id: t.id,
    kind: t.kind,
    date: t.date,
    amount: t.amount,
    accountId: t.accountId,
    exchangeRate: t.exchangeRate,
    categoryId: t.categoryId,
    clientId: t.clientId,
    projectId: t.projectId,
    counterpart: t.counterpart,
    description: t.description,
  };
}

function KindIcon({ t }: { t: TxItem }) {
  if (t.kind.startsWith("transfer")) return <ArrowLeftRight className="size-4 shrink-0 text-accent-2" aria-label="Transferencia" />;
  if (t.subscriptionId) return <Repeat className="size-4 shrink-0 text-text-faint" aria-label="Pago de suscripción" />;
  return <span aria-hidden className={`mx-[5px] block size-1.5 shrink-0 rounded-full ${t.kind === "income" ? "bg-success" : "bg-text-faint"}`} />;
}

function RowMenu({ t, onEdit }: { t: TxItem; onEdit: () => void }) {
  const { exec } = useAction();
  const transfer = t.kind.startsWith("transfer");
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon" aria-label="Acciones del movimiento" className="size-11 md:size-9">
          <MoreHorizontal className="size-4" />
        </Button>
      }
    >
      {!transfer ? (
        <MenuItem icon={<Pencil />} onSelect={onEdit}>
          Editar
        </MenuItem>
      ) : null}
      {t.receivableId && t.kind === "income" ? (
        <MenuItem icon={<FileText />} onSelect={() => window.open(`/finanzas/constancia/${t.id}`, "_blank", "noopener")}>
          Constancia
        </MenuItem>
      ) : null}
      <MenuSeparator />
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          const what = transfer ? "esta transferencia (se eliminan las dos patas)" : "este movimiento";
          const extra = t.receivableId || t.payableId ? " El cobro/pago vinculado vuelve a quedar pendiente por ese monto." : "";
          if (!confirm(`¿Mandar ${what} a la papelera?${extra} Restaurable 30 días.`)) return;
          exec(() => deleteTransactionAction(t.id), {
            success: "Movimiento en la papelera",
            undo: () => restoreTransactionAction(t.id),
          });
        }}
      >
        Eliminar
      </MenuItem>
    </Menu>
  );
}
