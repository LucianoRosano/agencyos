"use client";

import { Button, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { Activity, KeyRound, MoreHorizontal, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  checkNowAction,
  createEnvironmentAction,
  removeWordpressAction,
  restoreAssetAction,
  saveWordpressAction,
  setSiteMonitoringAction,
  trashAssetAction,
  updateEnvironmentAction,
} from "@/app/(app)/activos/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { ENV_KIND, type Opt, opts } from "./shared";

type EnvOptions = { sites: Opt[]; clients: Opt[]; hostings: Opt[] };

export function NewEnvironmentButton({
  options,
  label = "Monitorear un sitio",
  variant = "primary",
}: {
  options: EnvOptions;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState("");
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Monitorear un sitio"
      description="Chequeo HTTP cada 5 minutos. Se avisa si no responde 2 veces seguidas, y el SSL se lee solo cada día."
      wide
      trigger={
        <Button variant={variant}>
          <Plus className="size-4" /> {label}
        </Button>
      }
    >
      <ActionForm action={createEnvironmentAction} successMessage="Monitoreo activado" onSuccess={() => setOpen(false)}>
        {options.sites.length ? (
          <SelectField
            label="Sitio"
            name="siteId"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            placeholder="Nuevo sitio…"
            options={options.sites}
          />
        ) : null}
        {!siteId ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField
              label="Nombre del sitio"
              name="siteName"
              required
              placeholder="Librería Uno · tienda"
              maxLength={160}
              hint={options.sites.length ? undefined : "Se crea un sitio mínimo que después completás en Sitios."}
            />
            <SelectField label="Cliente" name="clientId" placeholder="Propio / sin cliente" options={options.clients} />
          </div>
        ) : null}
        <TextField label="URL" name="url" required inputMode="url" autoCapitalize="none" placeholder="https://libreriauno.com.ar" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SelectField label="Entorno" name="kind" defaultValue="prod" options={opts(ENV_KIND)} />
          <SelectField label="Hosting" name="hostingId" placeholder="Sin hosting" options={options.hostings} />
        </div>
        <div className="flex justify-end">
          <SubmitButton>Activar monitoreo</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export type EnvMenuData = {
  id: string;
  url: string;
  kind: string;
  hostingId: string | null;
  siteId: string;
  siteName: string;
  monitorEnabled: boolean;
  wordpress: { username: string | null } | null;
};

export function EnvironmentActions({ env, hostings }: { env: EnvMenuData; hostings: Opt[] }) {
  const { exec, pending } = useAction();
  const [editing, setEditing] = useState(false);
  const [wp, setWp] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        disabled={!env.monitorEnabled}
        onClick={() =>
          exec(() => checkNowAction(env.id), {
            onDone: (r) => {
              const d = r as { ok: boolean; latencyMs: number | null; error: string | null };
              if (d.ok) toast.success(`Responde${d.latencyMs ? ` en ${d.latencyMs} ms` : ""}`);
              else toast.error(`No responde: ${d.error ?? "sin respuesta"}`);
            },
          })
        }
      >
        <Activity className="size-4" /> Chequear
      </Button>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label={`Acciones de ${env.url}`} className="size-11 md:size-9">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
          Editar entorno
        </MenuItem>
        <MenuItem icon={<KeyRound />} onSelect={() => setWp(true)}>
          {env.wordpress ? "Acceso WordPress" : "Conectar WordPress"}
        </MenuItem>
        <MenuItem
          icon={env.monitorEnabled ? <Pause /> : <Play />}
          onSelect={() =>
            exec(() => setSiteMonitoringAction(env.siteId, !env.monitorEnabled), {
              success: env.monitorEnabled ? `Monitoreo de ${env.siteName} en pausa` : `Monitoreo de ${env.siteName} activo`,
              undo: () => setSiteMonitoringAction(env.siteId, env.monitorEnabled),
            })
          }
        >
          {env.monitorEnabled ? "Pausar monitoreo del sitio" : "Reanudar monitoreo del sitio"}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (!confirm(`¿Dejar de monitorear ${env.url} y mandarlo a la papelera? El historial queda 90 días.`)) return;
            exec(() => trashAssetAction("site_environment", env.id), {
              success: "Entorno en la papelera",
              undo: () => restoreAssetAction("site_environment", env.id),
            });
          }}
        >
          Eliminar entorno
        </MenuItem>
      </Menu>
      <Sheet open={editing} onOpenChange={setEditing} title={`Editar ${env.siteName}`}>
        <ActionForm action={updateEnvironmentAction.bind(null, env.id)} successMessage="Entorno actualizado" onSuccess={() => setEditing(false)}>
          <TextField label="URL" name="url" required defaultValue={env.url} inputMode="url" autoCapitalize="none" />
          <SelectField label="Entorno" name="kind" defaultValue={env.kind} options={opts(ENV_KIND)} />
          <SelectField label="Hosting" name="hostingId" defaultValue={env.hostingId ?? ""} placeholder="Sin hosting" options={hostings} />
          <div className="flex justify-end">
            <SubmitButton>Guardar</SubmitButton>
          </div>
        </ActionForm>
      </Sheet>
      <WordpressSheet env={env} open={wp} onOpenChange={setWp} />
    </div>
  );
}

/** Application Password: se escribe una vez y se guarda cifrada; nunca se vuelve a mostrar. */
function WordpressSheet({ env, open, onOpenChange }: { env: EnvMenuData; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { exec } = useAction();
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Acceso REST de WordPress"
      description="Con una Application Password (Usuarios → Perfil → Contraseñas de aplicación) el chequeo diario lee las versiones de WordPress, PHP y plugins."
    >
      {env.wordpress ? (
        <p className="mb-4 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-text-muted">
          Conectado como <span className="font-mono text-text">{env.wordpress.username}</span>. La contraseña está guardada cifrada y no se muestra. Para
          cambiarla, cargá una nueva.
        </p>
      ) : null}
      <ActionForm
        action={saveWordpressAction.bind(null, env.id)}
        successMessage="Acceso guardado (cifrado)"
        onSuccess={() => onOpenChange(false)}
        resetOnSuccess
      >
        <TextField
          label="Usuario de WordPress"
          name="username"
          required
          defaultValue={env.wordpress?.username ?? ""}
          autoCapitalize="none"
          autoComplete="off"
        />
        <TextField
          label="Application Password"
          name="appPassword"
          required
          type="password"
          autoComplete="new-password"
          placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
          hint="Se cifra al guardar. Usá un usuario con permiso para ver plugins."
        />
        <div className="flex flex-wrap justify-end gap-2">
          {env.wordpress ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (!confirm("¿Quitar el acceso de WordPress? Se borra la contraseña guardada.")) return;
                exec(() => removeWordpressAction(env.id), { success: "Acceso quitado", onDone: () => onOpenChange(false) });
              }}
            >
              Quitar acceso
            </Button>
          ) : null}
          <SubmitButton>Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}
