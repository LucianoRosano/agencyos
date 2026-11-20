"use client";

import { Button, Sheet } from "@agencyos/ui";
import { Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { createSiteAction, updateSiteAction } from "@/app/(app)/sitios/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import type { Opt } from "./shared";

export type ProjectOpt = { value: string; label: string; clientId: string | null; kind: string };
export type Defaults = Partial<Record<"name" | "clientId" | "projectId" | "kind" | "stack" | "prodUrl" | "stagingUrl" | "notesMd", string | null>>;

/** Campos cargados aparte (fuera del JS inicial de la ficha: solo se usan al abrir «Editar»). */
const SiteFields = dynamic(() => import("./site-fields").then((m) => m.SiteFields), {
  loading: () => <div className="h-72 animate-pulse rounded-lg bg-surface-2" />,
});

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
