"use client";

import { Button, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { Check, Copy, KeyRound, MoreHorizontal, Pause, Play, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  createEndpointAction,
  deleteEndpointAction,
  restoreEndpointAction,
  rotateEndpointSecretAction,
  setEndpointActiveAction,
} from "@/app/(app)/automatizaciones/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";

function CopyRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] font-medium text-text-muted">{label}</p>
      <div className="flex items-stretch gap-2">
        <code
          data-testid={testId}
          className="min-w-0 flex-1 break-all rounded-[var(--radius-control)] border border-border bg-bg-elevated px-3 py-2 font-mono text-[12px] text-text"
        >
          {value}
        </code>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="size-11 shrink-0 md:size-10"
          aria-label={`Copiar ${label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(
              () => {
                setDone(true);
                toast.success("Copiado");
              },
              () => toast.error("No se pudo copiar: seleccionalo y copialo a mano"),
            );
          }}
        >
          {done ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

/** Muestra el secreto UNA vez (no se puede volver a ver: solo rotar). */
function SecretReveal({ secret, url, direction, onClose }: { secret: string; url?: string; direction: string; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-[var(--radius-control)] border border-warning/30 bg-warning-soft/40 p-3 text-[13px] text-text">
        Copiá el secreto ahora: se guarda cifrado y <strong>no se vuelve a mostrar</strong>. Si lo perdés, rotalo.
      </p>
      {direction === "in" && url ? <CopyRow label="URL para enviar (POST)" value={url} testId="webhook-url" /> : null}
      <CopyRow label="Secreto de firma" value={secret} testId="webhook-secret" />
      <p className="text-[12px] leading-relaxed text-text-faint">
        Firma: encabezado <code className="font-mono">X-Agencyos-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code>, donde v1 = HMAC-SHA256(secreto, «t.cuerpo»).
        Se rechazan firmas de más de 5 minutos y entregas repetidas.
      </p>
      <div className="flex justify-end">
        <Button variant="primary" onClick={onClose}>
          Listo, lo guardé
        </Button>
      </div>
    </div>
  );
}

export function NewEndpointSheet({ baseUrl }: { baseUrl: string }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState("in");
  const [created, setCreated] = useState<{ id: string; secret: string; direction: string } | null>(null);
  const router = useRouter();
  const close = () => {
    setOpen(false);
    if (created) router.refresh();
    setCreated(null);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
      title={created ? "Webhook creado" : "Nuevo webhook"}
      description={created ? undefined : "Entrante: otro sistema avisa a AGENCYOS. Saliente: una regla le avisa a otro sistema."}
      trigger={
        <Button variant="primary">
          <Plus className="size-4" /> Nuevo webhook
        </Button>
      }
    >
      {created ? (
        <SecretReveal secret={created.secret} direction={created.direction} url={`${baseUrl}/api/webhooks/in/${created.id}`} onClose={close} />
      ) : (
        <ActionForm
          action={createEndpointAction}
          successMessage="Webhook creado"
          onSuccess={(d) => setCreated(d as { id: string; secret: string; direction: string })}
        >
          <SelectField
            label="Tipo"
            name="direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            options={[
              { value: "in", label: "Entrante (recibe avisos)" },
              { value: "out", label: "Saliente (lo usan las reglas)" },
            ]}
          />
          <TextField label="Nombre" name="name" required maxLength={80} placeholder={direction === "in" ? "Ej.: Formulario del sitio" : "Ej.: n8n"} />
          {direction === "out" ? (
            <TextField
              label="URL de destino"
              name="url"
              type="url"
              required
              inputMode="url"
              placeholder="https://…"
              hint="Solo URLs públicas (http/https, puertos 80 y 443)."
            />
          ) : null}
          <div className="flex justify-end">
            <SubmitButton>Crear</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function EndpointMenu({ id, name, active, direction, baseUrl }: { id: string; name: string; active: boolean; direction: string; baseUrl: string }) {
  const { exec } = useAction();
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" className="size-11 md:size-10" aria-label={`Acciones de «${name}»`}>
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem
          icon={active ? <Pause /> : <Play />}
          onSelect={() =>
            exec(() => setEndpointActiveAction(id, !active), {
              success: active ? "Webhook pausado" : "Webhook activado",
              undo: () => setEndpointActiveAction(id, active),
            })
          }
        >
          {active ? "Pausar" : "Activar"}
        </MenuItem>
        <MenuItem
          icon={<KeyRound />}
          onSelect={() => {
            if (!confirm(`¿Rotar el secreto de «${name}»? El actual deja de valer en el acto.`)) return;
            exec(() => rotateEndpointSecretAction(id), { success: "Secreto rotado", onDone: (d) => setSecret((d as { secret: string }).secret) });
          }}
        >
          Rotar secreto
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (!confirm(`¿Mandar «${name}» a la papelera? Deja de recibir/enviar. Restaurable 30 días.`)) return;
            exec(() => deleteEndpointAction(id), { success: "Webhook en la papelera", undo: () => restoreEndpointAction(id) });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>
      <Sheet open={secret !== null} onOpenChange={(o) => !o && setSecret(null)} title="Nuevo secreto">
        {secret ? <SecretReveal secret={secret} direction={direction} url={`${baseUrl}/api/webhooks/in/${id}`} onClose={() => setSecret(null)} /> : null}
      </Sheet>
    </>
  );
}
