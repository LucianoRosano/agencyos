"use client";

import { L } from "@agencyos/core";
import { Button, Sheet } from "@agencyos/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteEnvironmentAction, restoreEnvironmentAction, saveEnvironmentAction } from "@/app/(app)/sitios/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { type Opt, opts } from "./shared";

type Env = { id: string; kind: string; url: string; hostingId: string | null; phpVersion: string | null; wpVersion: string | null };

export function EnvironmentSheet({ siteId, env, hostings }: { siteId: string; env?: Env; hostings: Opt[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={env ? "Editar entorno" : "Nuevo entorno"}
      wide
      trigger={
        env ? (
          <Button variant="ghost" size="icon" aria-label={`Editar ${env.url}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button variant="secondary">
            <Plus className="size-4" /> Agregar entorno
          </Button>
        )
      }
    >
      <ActionForm action={saveEnvironmentAction.bind(null, siteId, env?.id ?? null)} successMessage="Entorno guardado" onSuccess={() => setOpen(false)}>
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label="Entorno" name="kind" defaultValue={env?.kind ?? "prod"} options={opts(L.envKind)} />
          <TextField label="URL" name="url" required defaultValue={env?.url ?? ""} inputMode="url" placeholder="ejemplo.com.ar" />
          <SelectField
            label="Hosting"
            name="hostingId"
            defaultValue={env?.hostingId ?? ""}
            placeholder={hostings.length ? "Sin vincular" : "No hay hostings cargados en Activos"}
            options={hostings}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="PHP" name="phpVersion" defaultValue={env?.phpVersion ?? ""} placeholder="8.2" inputMode="decimal" />
            <TextField label="WordPress" name="wpVersion" defaultValue={env?.wpVersion ?? ""} placeholder="6.7" inputMode="decimal" />
          </div>
        </div>
        <div className="flex justify-end">
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function DeleteEnvironmentButton({ id, url }: { id: string; url: string }) {
  const { exec } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Eliminar ${url}`}
      onClick={() => {
        if (!confirm(`¿Mandar el entorno ${url} a la papelera? Restaurable 30 días.`)) return;
        exec(() => deleteEnvironmentAction(id), { success: "Entorno en la papelera", undo: () => restoreEnvironmentAction(id) });
      }}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
