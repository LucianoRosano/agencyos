"use client";

import { formatDate } from "@agencyos/core";
import { Button, Input, Sheet } from "@agencyos/ui";
import { Check, Copy, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { revokeIcalAction, rotateIcalAction } from "@/app/(app)/calendario/actions";
import { useAction } from "@/components/use-action";

/**
 * Suscripción iCal de solo lectura. La URL (con el token) se muestra una sola vez;
 * rotarla invalida la anterior y revocarla corta el acceso.
 */
export function IcalSubscribe({ active, createdAt }: { active: boolean; createdAt: string | null }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { exec, pending } = useAction();

  const generate = () => {
    if (active && !confirm("Se genera una URL nueva y la anterior deja de funcionar en los calendarios donde la agregaste. ¿Seguimos?")) return;
    exec(() => rotateIcalAction(), {
      success: active ? "URL nueva generada" : "URL de suscripción generada",
      onDone: (d) => {
        setCopied(false);
        setUrl(`${window.location.origin}/api/calendario/ical/${d.token}`);
      },
    });
  };
  const revoke = () => {
    if (!confirm("¿Revocar la suscripción? Los calendarios que la usan dejan de actualizarse. No se puede deshacer: después podés generar una URL nueva.")) return;
    exec(() => revokeIcalAction(), { success: "Suscripción revocada", onDone: () => setUrl(null) });
  };
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("URL copiada");
    } catch {
      toast.error("No se pudo copiar: seleccionala y copiala a mano");
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setUrl(null);
      }}
      title="Suscribirme desde el celular"
      description="Una URL privada de solo lectura con todas tus fechas (iCal). Agregala en Google Calendar, Apple Calendar u Outlook como «calendario por URL»."
      trigger={<Button variant="secondary"><Smartphone className="size-4" /> Suscribirme desde el celular</Button>}
    >
      <div className="flex flex-col gap-4">
        {url ? (
          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-warning/40 bg-warning-soft p-3.5">
            <p className="text-[13px] text-text">Copiala ahora: <strong>por seguridad no se vuelve a mostrar</strong>. Quien tenga esta URL ve tus fechas.</p>
            <label htmlFor="ical-url" className="sr-only">URL de suscripción</label>
            <Input id="ical-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-[13px] md:text-[12px]" />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={copy}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copiada" : "Copiar URL"}</Button>
              <Button asChild variant="secondary">
                <a href={url.replace(/^https?:/, "webcal:")}>Abrir en el calendario</a>
              </Button>
            </div>
          </div>
        ) : null}
        <p className="text-[14px] text-text-muted">
          {active ? <>Tenés una suscripción activa desde el <span className="font-mono text-text">{formatDate(createdAt ? new Date(createdAt) : null)}</span>. Si perdiste la URL, generá una nueva (la anterior deja de funcionar).</> : "Todavía no generaste una URL de suscripción."}
        </p>
        <p className="text-[13px] text-text-faint">Incluye desde 60 días atrás hasta un año adelante. Los calendarios suelen actualizar cada algunas horas.</p>
        <div className="flex flex-wrap justify-end gap-2">
          {active || url ? <Button variant="danger" onClick={revoke} loading={pending}>Revocar</Button> : null}
          <Button variant={url ? "secondary" : "primary"} onClick={generate} loading={pending}>{active || url ? "Generar URL nueva" : "Generar URL"}</Button>
        </div>
      </div>
    </Sheet>
  );
}
