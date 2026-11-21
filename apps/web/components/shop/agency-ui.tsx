"use client";

import { Button, Sheet } from "@agencyos/ui";
import { Plus } from "lucide-react";
import { useState } from "react";
import { createShopAction, reinviteOwnerAction, setShopStatusAction } from "@/app/(app)/comercios/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { toast } from "@/lib/toast";

function LinkBox({ url }: { url: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border p-3">
      <span className="text-[13px] text-text-muted">Mandale este enlace para que cree su contraseña (vence en 7 días):</span>
      <code className="font-mono text-[12px] break-all" data-testid="shop-invite-link">
        {url}
      </code>
      <Button
        size="sm"
        variant="secondary"
        className="h-10 self-start"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          toast.success("Enlace copiado");
        }}
      >
        Copiar enlace
      </Button>
    </div>
  );
}

export function NewShopSheet({ clients }: { clients: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setUrl(null);
      }}
      title="Nuevo comercio"
      description="Se crea el sistema de gestión del comercio y una invitación para su dueño."
      trigger={
        <Button variant="primary">
          <Plus className="size-4" /> Nuevo comercio
        </Button>
      }
    >
      {url ? (
        <LinkBox url={url} />
      ) : (
        <ActionForm
          action={createShopAction}
          successMessage={(d) => ((d as { emailed: boolean }).emailed ? "Comercio creado: invitación enviada por email" : "Comercio creado")}
          onSuccess={(d) => setUrl((d as { url: string }).url)}
        >
          <TextField label="Nombre del comercio" name="name" required placeholder="Ej.: Librería Uno" />
          <SelectField label="Cliente del CRM (opcional)" name="clientId" options={clients} placeholder="Sin vincular" />
          <TextField label="Nombre del dueño" name="ownerName" required />
          <TextField label="Email del dueño" name="ownerEmail" type="email" required />
          <div className="flex justify-end">
            <SubmitButton>Crear comercio</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Sheet>
  );
}

export function ShopRowActions({ id, status, name }: { id: string; status: string; name: string }) {
  const { exec, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap gap-2">
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setUrl(null);
        }}
        title={`Nuevo enlace para el dueño de ${name}`}
        trigger={
          <Button size="sm" variant="ghost" className="h-10">
            Reenviar acceso
          </Button>
        }
      >
        {url ? (
          <LinkBox url={url} />
        ) : (
          <ActionForm action={reinviteOwnerAction.bind(null, id)} successMessage="Enlace nuevo creado" onSuccess={(d) => setUrl((d as { url: string }).url)}>
            <TextField label="Nombre" name="name" required />
            <TextField label="Email" name="email" type="email" required />
            <div className="flex justify-end">
              <SubmitButton>Crear enlace</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Sheet>
      <Button
        size="sm"
        variant="ghost"
        className="h-10"
        loading={pending}
        onClick={() => {
          const next = status === "active" ? "suspended" : "active";
          if (next === "suspended" && !confirm(`¿Suspender «${name}»? Sus usuarios no van a poder entrar hasta que lo reactives.`)) return;
          exec(() => setShopStatusAction(id, next), { success: next === "suspended" ? "Comercio suspendido" : "Comercio reactivado" });
        }}
      >
        {status === "active" ? "Suspender" : "Reactivar"}
      </Button>
    </span>
  );
}
