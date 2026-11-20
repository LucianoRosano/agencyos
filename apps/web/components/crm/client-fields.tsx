"use client";

import { L } from "@agencyos/core";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { opts } from "./shared";

type Opt = { value: string; label: string };
type Defaults = Record<string, string | null | undefined>;

export function ClientFields({ spaces, d = {} }: { spaces: Opt[]; d?: Defaults }) {
  const v = (k: string) => d[k] ?? "";
  return (
    <>
      <TextField label="Nombre" name="name" required defaultValue={v("name")} autoFocus={!d.name} maxLength={160} placeholder="Ej.: Bellezatecnia" />
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Estado" name="status" defaultValue={v("status") || "prospect"} options={opts(L.clientStatus)} />
        <SelectField label="Relación" name="relationship" defaultValue={v("relationship") || "external"} options={opts(L.relationship)} />
        <TextField label="Nombre comercial" name="tradeName" defaultValue={v("tradeName")} />
        <TextField label="Rubro" name="industry" defaultValue={v("industry")} placeholder="Ej.: Estética" />
        <TextField label="Sitio web" name="website" defaultValue={v("website")} inputMode="url" placeholder="ejemplo.com.ar" />
        <TextField label="Origen" name="source" defaultValue={v("source")} placeholder="Referido, Instagram, web…" />
        <TextField label="Ciudad" name="city" defaultValue={v("city")} />
        <TextField label="Provincia" name="province" defaultValue={v("province")} />
        <SelectField
          label="Espacio"
          name="spaceId"
          defaultValue={v("spaceId")}
          options={spaces}
          placeholder={d.spaceId ? undefined : "Agencia (por defecto)"}
        />
      </div>
      <TextAreaField label="Notas internas (Markdown)" name="notesMd" defaultValue={v("notesMd")} rows={5} className="font-mono" />
    </>
  );
}
