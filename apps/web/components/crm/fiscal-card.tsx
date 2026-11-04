"use client";

import { Badge, BlockCard, Button } from "@agencyos/ui";
import { Eye, EyeOff, Landmark, Lock, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addFiscalAction, removeFiscalAction, revealFiscalAction } from "@/app/(app)/crm/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckField, SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { opts, VAT_LABELS } from "./shared";

type Holder = { id: string; legalName: string; taxId: string | null; vatCondition: string | null; isDefault: boolean };

/**
 * Titulares fiscales: ocultos por defecto. "Mostrar" los trae con una Server Action
 * que deja constancia en la auditoría (fiscal.viewed). Sin permiso, no hay botón.
 */
export function FiscalCard({ clientId, count, allowed }: { clientId: string; count: number; allowed: boolean }) {
  const [holders, setHolders] = useState<Holder[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const { exec } = useAction();

  function reveal() {
    start(async () => {
      const r = await revealFiscalAction(clientId);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      setHolders(r.data);
    });
  }

  if (!allowed) {
    return (
      <BlockCard icon={<Landmark />} title="Datos fiscales">
        <p className="flex items-center gap-2 text-[13px] text-text-muted"><Lock className="size-4 shrink-0" /> Solo el dueño o un administrador pueden ver los datos fiscales.</p>
      </BlockCard>
    );
  }

  const shown = holders !== null;
  return (
    <BlockCard
      icon={<Landmark />}
      title="Datos fiscales"
      action={
        shown ? (
          <Button size="sm" variant="ghost" onClick={() => { setHolders(null); setAdding(false); }}><EyeOff className="size-4" /> Ocultar</Button>
        ) : null
      }
    >
      {!shown ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13px] text-text-muted">
            {count ? `${count} ${count === 1 ? "titular cargado" : "titulares cargados"}. ` : "Sin titulares cargados. "}
            Ocultos por defecto: ver queda registrado en la auditoría.
          </p>
          <Button size="sm" variant="secondary" loading={pending} onClick={reveal}><Eye className="size-4" /> Mostrar datos fiscales</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {holders.length ? (
            <ul className="flex flex-col gap-2">
              {holders.map((h) => (
                <li key={h.id} className="flex items-start gap-3 rounded-[10px] border border-border bg-bg-elevated p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[14px] text-text">{h.legalName} {h.isDefault ? <Badge tone="info">Principal</Badge> : null}</p>
                    <p className="mt-0.5 font-mono text-[12px] text-text-muted">CUIT {h.taxId ?? "—"} · {h.vatCondition ? VAT_LABELS[h.vatCondition] : "sin condición de IVA"}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Quitar titular ${h.legalName}`}
                    onClick={() => {
                      if (!confirm(`¿Quitar el titular «${h.legalName}»?`)) return;
                      exec(() => removeFiscalAction(h.id), { success: "Titular quitado", onDone: () => setHolders((xs) => xs?.filter((x) => x.id !== h.id) ?? null) });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-text-muted">Todavía no hay titulares fiscales.</p>
          )}
          {adding ? (
            <ActionForm action={addFiscalAction.bind(null, clientId)} successMessage="Titular agregado" onSuccess={() => { setAdding(false); reveal(); }}>
              <TextField label="Razón social" name="legalName" required />
              <TextField label="CUIT" name="taxId" inputMode="numeric" placeholder="20-12345678-6" />
              <SelectField label="Condición de IVA" name="vatCondition" options={opts(VAT_LABELS)} placeholder="Sin especificar" />
              <CheckField label="Titular principal" name="isDefault" defaultChecked={!holders.length} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" type="button" onClick={() => setAdding(false)}>Cancelar</Button>
                <SubmitButton variant="secondary">Guardar titular</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <Button size="sm" variant="ghost" className="self-start" onClick={() => setAdding(true)}>+ Agregar titular</Button>
          )}
        </div>
      )}
    </BlockCard>
  );
}
