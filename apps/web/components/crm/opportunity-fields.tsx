"use client";

import { SelectField, TextField } from "@/components/fields";

type Opt = { value: string; label: string };
type Defaults = Record<string, string | number | null | undefined>;

export function OpportunityFields({ clientId, clients, d = {} }: { clientId?: string; clients?: Opt[]; d?: Defaults }) {
  const v = (k: string) => (d[k] === null || d[k] === undefined ? "" : String(d[k]));
  return (
    <>
      {clientId ? (
        <input type="hidden" name="clientId" value={clientId} />
      ) : (
        <SelectField label="Cliente" name="clientId" options={clients ?? []} placeholder="Elegí un cliente" defaultValue={v("clientId")} required />
      )}
      <TextField label="Título" name="title" required defaultValue={v("title")} placeholder="Ej.: Tienda online con Mercado Pago" maxLength={200} />
      <div className="grid grid-cols-[1fr_110px] gap-3 md:grid-cols-[1fr_110px_120px]">
        <TextField label="Valor estimado" name="valueAmount" inputMode="decimal" defaultValue={v("valueAmount")} placeholder="1.500.000" />
        <SelectField
          label="Moneda"
          name="valueCurrency"
          defaultValue={v("valueCurrency") || "ARS"}
          options={[
            { value: "ARS", label: "ARS" },
            { value: "USD", label: "USD" },
          ]}
        />
        <TextField
          label="Probabilidad %"
          name="probability"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={5}
          defaultValue={v("probability") || "20"}
          className="col-span-2 md:col-span-1"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <TextField label="Próxima acción" name="nextAction" defaultValue={v("nextAction")} placeholder="Ej.: llamar para coordinar reunión" />
        <TextField label="Para el" name="nextActionDue" type="date" defaultValue={v("nextActionDue")} hint="Aparece en Hoy." />
      </div>
      <TextField label="Cierre estimado" name="expectedClose" type="date" defaultValue={v("expectedClose")} className="md:max-w-[50%]" />
    </>
  );
}
