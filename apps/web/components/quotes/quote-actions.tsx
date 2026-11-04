"use client";

import { formatDate, formatMoney } from "@agencyos/core";
import { Button, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { Check, ClipboardCopy, Copy, Download, GitBranchPlus, MoreHorizontal, Send, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  acceptQuoteAction, deleteQuoteAction, markSentAction, markViewedAction, newVersionAction, rejectQuoteAction, restoreQuoteAction, voidQuoteAction,
} from "@/app/(app)/presupuestos/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckField, TextAreaField } from "@/components/fields";
import { useAction } from "@/components/use-action";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Texto copiado. Pegalo en WhatsApp o en el email.");
  } catch {
    toast.error("No se pudo copiar. Seleccioná el texto y copialo a mano.");
  }
}

export function PdfButton({ id, versionId, label = "Descargar PDF", variant = "secondary" }: { id: string; versionId?: string; label?: string; variant?: "secondary" | "ghost" | "outline" }) {
  return (
    <Button asChild variant={variant}>
      <a href={`/api/presupuestos/${id}/pdf${versionId ? `?version=${versionId}` : ""}`} download>
        <Download className="size-4" /> {label}
      </a>
    </Button>
  );
}

/** Enviar (MVP): descargar el PDF, copiar el texto y confirmar el envío. */
export function SendSheet({ id, number, text, validUntil, today }: { id: string; number: string; text: string; validUntil: string; today: string }) {
  const [open, setOpen] = useState(false);
  const { exec, pending } = useAction();
  const expired = validUntil < today;
  return (
    <Sheet open={open} onOpenChange={setOpen} title={`Enviar ${number}`} description="Lo mandás vos por WhatsApp o email; acá queda registrado." wide trigger={<Button variant="primary"><Send className="size-4" /> Marcar como enviado</Button>}>
      <ol className="flex flex-col gap-5">
        <li className="flex flex-col gap-2">
          <p className="text-[14px] font-medium text-text">1 · Descargá el PDF</p>
          <PdfButton id={id} variant="outline" />
        </li>
        <li className="flex flex-col gap-2">
          <p className="text-[14px] font-medium text-text">2 · Copiá el mensaje</p>
          <textarea readOnly value={text} rows={8} aria-label="Texto para WhatsApp o email" className="w-full rounded-[var(--radius-control)] border border-border bg-bg-elevated p-3 font-mono text-[13px] leading-relaxed text-text-muted" />
          <Button variant="outline" onClick={() => copy(text)} className="self-start">
            <ClipboardCopy className="size-4" /> Copiar texto para WhatsApp/email
          </Button>
        </li>
        <li className="flex flex-col gap-2">
          <p className="text-[14px] font-medium text-text">3 · Confirmá el envío</p>
          <p className="text-[13px] text-text-muted">
            La versión actual queda bloqueada (para cambiarla se crea una nueva versión) y, si hay oportunidad, pasa a «Propuesta enviada». Válido hasta el {formatDate(validUntil)}.
          </p>
          {expired ? <p className="text-[13px] text-danger">La validez ya pasó: editá la fecha «válido hasta» antes de enviarlo.</p> : null}
          <Button variant="primary" loading={pending} disabled={expired} className="self-start" onClick={() => exec(() => markSentAction(id), { success: `${number} marcado como enviado`, onDone: () => setOpen(false) })}>
            <Check className="size-4" /> Ya lo envié
          </Button>
        </li>
      </ol>
    </Sheet>
  );
}

export function AcceptSheet({
  id,
  number,
  canCreateProject,
  templateName,
  title,
  opportunityTitle,
  schedule,
  currency,
  planLabel,
}: {
  id: string;
  number: string;
  canCreateProject: boolean;
  templateName: string | null;
  title: string;
  opportunityTitle: string | null;
  schedule: { label: string; amount: string; dueDate: string }[];
  currency: string;
  planLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Sheet open={open} onOpenChange={setOpen} title={`Aceptar ${number}`} description="Elegí qué se crea. Todo se hace junto: si algo falla, no se crea nada." wide trigger={<Button variant="primary"><Check className="size-4" /> Aceptar</Button>}>
      <ActionForm
        action={acceptQuoteAction.bind(null, id)}
        successMessage={(r: { projectId: string | null; receivables: number }) => `Presupuesto aceptado${r.receivables ? ` · ${r.receivables} cobro${r.receivables === 1 ? "" : "s"} pendiente${r.receivables === 1 ? "" : "s"}` : ""}`}
        onSuccess={() => {
          setOpen(false);
          router.refresh();
        }}
      >
        {canCreateProject ? (
          <CheckField name="createProject" defaultChecked label={`Crear el proyecto «${title}»`} hint={`Plantilla: ${templateName ?? "En blanco"} · primera acción: Kickoff con el cliente (aparece en Hoy).`} />
        ) : (
          <p className="text-[13px] text-text-muted">El proyecto ya está creado.</p>
        )}
        <div>
          <CheckField name="createReceivables" defaultChecked label={`Crear ${schedule.length} cobro${schedule.length === 1 ? "" : "s"} pendiente${schedule.length === 1 ? "" : "s"} (${planLabel.toLowerCase()})`} hint="Quedan en Finanzas → Por cobrar." />
          <ul className="mt-1 ml-7 flex max-h-40 flex-col gap-1 overflow-y-auto text-[13px]">
            {schedule.map((s, i) => (
              <li key={`${s.label}-${i}`} className="flex justify-between gap-3 text-text-muted">
                <span className="truncate">{s.label} · vence {formatDate(s.dueDate)}</span>
                <span className="font-mono text-text">{formatMoney(s.amount, currency)}</span>
              </li>
            ))}
          </ul>
        </div>
        {opportunityTitle ? <CheckField name="markOpportunityWon" defaultChecked label={`Marcar la oportunidad «${opportunityTitle}» como ganada`} /> : null}
        <div className="flex justify-end">
          <SubmitButton>Confirmar aceptación</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function RejectSheet({ id, number }: { id: string; number: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen} title={`Rechazar ${number}`} trigger={<Button variant="secondary"><X className="size-4" /> Rechazar</Button>}>
      <ActionForm action={rejectQuoteAction.bind(null, id)} successMessage="Presupuesto rechazado" onSuccess={() => setOpen(false)}>
        <TextAreaField label="Motivo (opcional)" name="reason" rows={3} maxLength={500} placeholder="Ej.: eligió otra propuesta, presupuesto alto…" />
        <div className="flex justify-end">
          <SubmitButton variant="danger">Rechazar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function NewVersionButton({ id, next, variant = "secondary" }: { id: string; next: number; variant?: "primary" | "secondary" }) {
  const { exec, pending } = useAction();
  const router = useRouter();
  return (
    <Button variant={variant} loading={pending} onClick={() => exec(() => newVersionAction(id), { success: `Versión v${next} creada: ya podés editarla`, onDone: () => router.push(`/presupuestos/${id}/editar`) })}>
      <GitBranchPlus className="size-4" /> Crear versión v{next}
    </Button>
  );
}

export function QuoteMenu({ id, number, status, text, nextVersion }: { id: string; number: string; status: string; text: string; nextVersion: number }) {
  const { exec } = useAction();
  const router = useRouter();
  const canVersion = ["sent", "viewed", "expired", "rejected"].includes(status);
  const canVoid = !["accepted", "void"].includes(status);
  return (
    <Menu trigger={<Button variant="ghost" size="icon" aria-label="Más acciones"><MoreHorizontal className="size-4" /></Button>}>
      <MenuItem icon={<Copy />} onSelect={() => void copy(text)}>
        Copiar texto para WhatsApp/email
      </MenuItem>
      {status === "sent" ? (
        <MenuItem onSelect={() => exec(() => markViewedAction(id), { success: "Marcado como visto" })}>Marcar como visto</MenuItem>
      ) : null}
      {canVersion ? (
        <MenuItem icon={<GitBranchPlus />} onSelect={() => exec(() => newVersionAction(id), { success: `Versión v${nextVersion} creada`, onDone: () => router.push(`/presupuestos/${id}/editar`) })}>
          Nueva versión (v{nextVersion})
        </MenuItem>
      ) : null}
      {canVoid ? (
        <MenuItem
          onSelect={() => {
            if (!confirm(`¿Anular ${number}? Queda en el historial como anulado y no se puede reabrir.`)) return;
            exec(() => voidQuoteAction(id), { success: `${number} anulado` });
          }}
        >
          Anular
        </MenuItem>
      ) : null}
      <MenuSeparator />
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          if (!confirm(`¿Mandar ${number} a la papelera? Restaurable durante 30 días.`)) return;
          exec(() => deleteQuoteAction(id), { success: "Presupuesto en la papelera", undo: () => restoreQuoteAction(id), onDone: () => router.push("/presupuestos") });
        }}
      >
        Eliminar
      </MenuItem>
    </Menu>
  );
}
