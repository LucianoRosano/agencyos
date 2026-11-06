"use client";

import { setTargetRateAction } from "@/app/(app)/proyectos/time-actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";

/** Tarifa objetivo por hora (workspace.settings): referencia para la tarifa efectiva de proyectos y clientes. */
export function TargetRateForm({ amount, currency }: { amount: string; currency: string }) {
  return (
    <ActionForm action={setTargetRateAction} successMessage="Tarifa objetivo guardada">
      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-4 md:max-w-md">
        <TextField
          label="Tarifa objetivo por hora"
          name="targetHourlyRate"
          inputMode="decimal"
          defaultValue={amount}
          placeholder="25.000"
          hint="Vacío = sin objetivo."
        />
        <SelectField
          label="Moneda"
          name="targetHourlyCurrency"
          defaultValue={currency}
          options={[
            { value: "ARS", label: "ARS" },
            { value: "USD", label: "USD" },
          ]}
        />
      </div>
      <SubmitButton className="self-start">Guardar</SubmitButton>
    </ActionForm>
  );
}
