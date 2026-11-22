"use client";

import { Button, Sheet } from "@agencyos/ui";
import { Landmark } from "lucide-react";
import { useState } from "react";
import { addFiscalRemindersAction } from "@/app/(app)/calendario/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckField, TextField } from "@/components/fields";

/** Agenda los vencimientos fiscales del monotributo (pago mensual, recategorización) y el certificado de ARCA. */
export function FiscalReminders() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Landmark className="size-4" aria-hidden /> Vencimientos fiscales
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Vencimientos fiscales">
        <ActionForm action={addFiscalRemindersAction} successMessage="Vencimientos agendados" onSuccess={() => setOpen(false)}>
          <p className="text-[14px] text-text-muted">
            Se agendan como vencimientos que se repiten solos y avisan en «Ponerse al día» de Hoy. Los que ya tenés pendientes no se duplican.
          </p>
          <CheckField label="Pago mensual del monotributo (día 20 de cada mes)" name="monotributo" defaultChecked />
          <CheckField label="Recategorización del monotributo (febrero y agosto)" name="recategorizacion" defaultChecked />
          <TextField
            label="Vencimiento del certificado digital de ARCA (opcional)"
            name="certificado"
            type="date"
            hint="Figura en ARCA → Administración de certificados digitales."
          />
          <div className="flex justify-end">
            <SubmitButton>Agendar</SubmitButton>
          </div>
        </ActionForm>
      </Sheet>
    </>
  );
}
