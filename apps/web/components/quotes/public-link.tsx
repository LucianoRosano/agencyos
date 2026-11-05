"use client";

import { Button, Input, Sheet } from "@agencyos/ui";
import { Copy, Link2, Mail, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createPublicLinkAction, emailPublicLinkAction, revokePublicLinkAction } from "@/app/(app)/presupuestos/actions";
import { useAction } from "@/components/use-action";

/** Enlace público para que el cliente vea, descargue y acepte el presupuesto (F2). */
export function PublicLinkSheet({
  id,
  number,
  hasLink,
  contactEmail,
  emailEnabled,
}: {
  id: string;
  number: string;
  hasLink: boolean;
  contactEmail: string | null;
  emailEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [to, setTo] = useState(contactEmail ?? "");
  const { exec, pending } = useAction();
  const wa = url ? `https://wa.me/?text=${encodeURIComponent(`Te comparto el presupuesto ${number}: podés verlo, descargarlo y aceptarlo acá ${url}`)}` : "";
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Enlace para el cliente"
      description="El cliente lo ve, lo descarga y lo acepta online. Se registran nombre, fecha e IP."
      trigger={
        <Button variant="secondary">
          <Link2 className="size-4" /> Enlace
        </Button>
      }
    >
      {url ? (
        <div className="flex flex-col gap-3">
          <code className="break-all rounded-lg bg-surface-2 p-3 font-mono text-[12px]">{url}</code>
          <p className="text-[12px] text-text-muted">Se muestra una sola vez. Generar uno nuevo invalida el anterior.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(url);
                toast.success("Enlace copiado");
              }}
            >
              <Copy className="size-4" /> Copiar
            </Button>
            <Button asChild>
              <a href={wa} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </Button>
          </div>
          {emailEnabled ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (confirm(`¿Enviar el enlace a ${to}?`)) exec(() => emailPublicLinkAction(id, url, to), { success: "Email enviado" });
              }}
            >
              <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email del cliente" aria-label="Email del cliente" required />
              <Button type="submit" loading={pending}>
                <Mail className="size-4" /> Enviar
              </Button>
            </form>
          ) : (
            <p className="text-[12px] text-text-faint">El envío por email se habilita al configurar Brevo.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] text-text-muted">
            {hasLink ? "Ya hay un enlace activo. Podés generar uno nuevo (el anterior deja de funcionar) o revocarlo." : "Generá un enlace válido por 30 días."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              loading={pending}
              onClick={() => exec(() => createPublicLinkAction(id), { onDone: (d) => setUrl((d as { url: string }).url) })}
            >
              {hasLink ? "Generar nuevo enlace" : "Generar enlace"}
            </Button>
            {hasLink ? (
              <Button variant="danger" loading={pending} onClick={() => exec(() => revokePublicLinkAction(id), { success: "Enlace revocado" })}>
                Revocar
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Sheet>
  );
}
