"use client";

import { L } from "@agencyos/core";
import { useState } from "react";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { type Opt, opts } from "./shared";
import type { Defaults, ProjectOpt } from "./site-form";

const PROJECT_TO_SITE: Record<string, string> = { store: "store", website: "institutional", panel: "app" };

export function SiteFields({ clients, projects, defaults, edit }: { clients: Opt[]; projects: ProjectOpt[]; defaults: Defaults; edit?: boolean }) {
  const v = (k: keyof Defaults) => defaults[k] ?? "";
  const [clientId, setClientId] = useState(v("clientId"));
  const [kind, setKind] = useState(v("kind") || "institutional");
  return (
    <>
      <TextField label="Nombre del sitio" name="name" required defaultValue={v("name")} placeholder="Ej.: Tienda Librería Uno" maxLength={160} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField
          label="Proyecto"
          name="projectId"
          defaultValue={v("projectId")}
          placeholder="Sin proyecto"
          options={projects}
          onChange={(e) => {
            const p = projects.find((x) => x.value === e.target.value);
            if (p?.clientId && !clientId) setClientId(p.clientId);
            if (p && !edit && PROJECT_TO_SITE[p.kind]) setKind(PROJECT_TO_SITE[p.kind] as string);
          }}
        />
        <SelectField
          label="Cliente"
          name="clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Sin cliente"
          options={clients}
        />
        <SelectField label="Tipo de sitio" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} options={opts(L.siteKind)} />
        <SelectField label="Stack" name="stack" defaultValue={v("stack") || (kind === "store" ? "woocommerce" : "wordpress")} options={opts(L.siteStack)} />
        <TextField label="URL de producción" name="prodUrl" defaultValue={v("prodUrl")} inputMode="url" placeholder="ejemplo.com.ar" />
        <TextField label="URL de staging" name="stagingUrl" defaultValue={v("stagingUrl")} inputMode="url" placeholder="pruebas.ejemplo.com.ar" />
      </div>
      {edit ? <TextAreaField label="Notas internas (Markdown)" name="notesMd" defaultValue={v("notesMd")} rows={4} /> : null}
    </>
  );
}
