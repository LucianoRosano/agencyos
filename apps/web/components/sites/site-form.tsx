"use client";

import { L } from "@agencyos/core";
import { Button, Sheet } from "@agencyos/ui";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { createSiteAction, updateSiteAction } from "@/app/(app)/sitios/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { type Opt, opts } from "./shared";

export type ProjectOpt = { value: string; label: string; clientId: string | null; kind: string };
type Defaults = Partial<Record<"name" | "clientId" | "projectId" | "kind" | "stack" | "prodUrl" | "stagingUrl" | "notesMd", string | null>>;

const PROJECT_TO_SITE: Record<string, string> = { store: "store", website: "institutional", panel: "app" };

function SiteFields({ clients, projects, defaults, edit }: { clients: Opt[]; projects: ProjectOpt[]; defaults: Defaults; edit?: boolean }) {
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

export function NewSiteForm({ clients, projects, defaults }: { clients: Opt[]; projects: ProjectOpt[]; defaults: Defaults }) {
  return (
    <ActionForm
      action={createSiteAction}
      successMessage="Sitio creado: briefing, checklist de lanzamiento y documentación listos"
      redirectTo={(d) => `/sitios/${(d as { id: string }).id}`}
    >
      <SiteFields clients={clients} projects={projects} defaults={defaults} />
      <p className="text-[13px] text-text-muted">
        Al crearlo se arma el briefing según el tipo, el checklist de lanzamiento de 17 áreas y la nota de documentación técnica.
      </p>
      <div className="flex justify-end">
        <SubmitButton>Crear sitio</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function EditSiteSheet({ id, clients, projects, defaults }: { id: string; clients: Opt[]; projects: ProjectOpt[]; defaults: Defaults }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Editar sitio"
      wide
      trigger={
        <Button variant="secondary">
          <Pencil className="size-4" /> Editar
        </Button>
      }
    >
      <ActionForm action={updateSiteAction.bind(null, id)} successMessage="Sitio actualizado" onSuccess={() => setOpen(false)}>
        <SiteFields clients={clients} projects={projects} defaults={defaults} edit />
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}
