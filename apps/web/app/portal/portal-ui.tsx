"use client";

import { Button, Checkbox, cn, Field, Input, Sheet, Textarea } from "@agencyos/ui";
import { Check, LogOut, MessageSquareWarning } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { authClient } from "@/lib/auth-client";
import { approveDeliverableAction, decideQuoteAction, feedbackAction, requestChangesAction } from "./actions";

export function PortalNav() {
  const path = usePathname();
  const items = [
    { href: "/portal", label: "Inicio", active: path === "/portal" || path.startsWith("/portal/proyectos") },
    { href: "/portal/presupuestos", label: "Presupuestos", active: path.startsWith("/portal/presupuestos") },
  ];
  return (
    <nav aria-label="Portal" className="flex items-center gap-1">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          className={cn(
            "inline-flex h-11 items-center rounded-[9px] px-3 text-[14px]",
            i.active ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface-2 hover:text-text",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function PortalSignOut() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cerrar sesión"
      className="size-11 shrink-0"
      loading={pending}
      onClick={() =>
        start(async () => {
          await authClient.signOut();
          window.location.href = "/login";
        })
      }
    >
      {pending ? null : <LogOut className="size-4" />}
    </Button>
  );
}

/** Aprobar o pedir cambios en una entrega que espera la aprobación del cliente. */
export function DeliverableActions({ id, title }: { id: string; title: string }) {
  const { exec, pending } = useAction();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="primary"
        loading={pending}
        className="h-11"
        onClick={() => {
          if (confirm(`¿Aprobás la entrega «${title}»?`))
            exec(() => approveDeliverableAction(id), { success: "¡Gracias! Entrega aprobada.", onDone: () => router.refresh() });
        }}
      >
        <Check className="size-4" /> Aprobar
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Pedir cambios"
        description={`Contale a Luciano qué hay que cambiar en «${title}».`}
        trigger={
          <Button variant="secondary" className="h-11">
            <MessageSquareWarning className="size-4" /> Pedir cambios
          </Button>
        }
      >
        <ActionForm action={requestChangesAction.bind(null, id)} successMessage="Le avisamos a Luciano" onSuccess={() => setOpen(false)}>
          <TextAreaField label="¿Qué hay que cambiar?" name="comment" rows={5} required className="text-base md:text-sm" />
          <SubmitButton>Enviar pedido de cambios</SubmitButton>
        </ActionForm>
      </Sheet>
    </div>
  );
}

const PRIORITIES = [
  { value: "1", label: "Urgente" },
  { value: "2", label: "Alta" },
  { value: "3", label: "Normal" },
  { value: "4", label: "Baja" },
];

/** Cargar un ítem de feedback en la ronda de revisión abierta. */
export function FeedbackForm({ projectId }: { projectId: string }) {
  return (
    <ActionForm action={feedbackAction.bind(null, projectId)} successMessage="Feedback cargado" resetOnSuccess>
      <TextField label="Página o sección" name="pageRef" placeholder="Ej.: Inicio, Contacto" autoComplete="off" />
      <TextAreaField label="¿Qué viste?" name="description" rows={3} required />
      <SelectField label="Prioridad" name="priority" defaultValue="3" options={PRIORITIES} />
      <SubmitButton className="self-start">Cargar feedback</SubmitButton>
    </ActionForm>
  );
}

/** Aceptar o rechazar un presupuesto desde el portal (misma regla que el enlace público). */
export function QuoteDecisionForm({ quoteId, defaultName }: { quoteId: string; defaultName: string }) {
  const [state, action, pending] = useActionState(decideQuoteAction.bind(null, quoteId), null);
  const [decision, setDecision] = useState<"accepted" | "rejected">("accepted");
  if (state?.ok) {
    const d = (state.data as { decision: string }).decision;
    return (
      <p className="mt-3 text-[15px]" role="status">
        {d === "accepted" ? "¡Listo! El presupuesto quedó aceptado. Luciano se va a comunicar para arrancar." : "Registramos tu respuesta. Gracias por avisar."}
      </p>
    );
  }
  const err = state && !state.ok ? state.error : null;
  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Respuesta">
        {(["accepted", "rejected"] as const).map((d) => (
          <label
            key={d}
            className={`flex h-11 cursor-pointer items-center justify-center rounded-[10px] border text-[14px] ${decision === d ? "border-accent bg-accent-soft" : "border-border text-text-muted"}`}
          >
            <input type="radio" name="decision" value={d} checked={decision === d} onChange={() => setDecision(d)} className="sr-only" />
            {d === "accepted" ? "Acepto" : "No, gracias"}
          </label>
        ))}
      </div>
      <Field label="Tu nombre y apellido" name="signerName" error={err?.fields?.signerName}>
        <Input id="signerName" name="signerName" required autoComplete="name" defaultValue={defaultName} className="text-base md:text-sm" />
      </Field>
      <Field label={decision === "accepted" ? "Comentario (opcional)" : "¿Nos contás por qué? (opcional)"} name="comment">
        <Textarea id="comment" name="comment" rows={3} className="text-base md:text-sm" />
      </Field>
      {decision === "accepted" ? (
        <label className="flex min-h-11 items-start gap-3 text-[14px]">
          <Checkbox name="agree" className="mt-0.5" required />
          <span>Leí el presupuesto y acepto el alcance, los plazos y las condiciones de pago.</span>
        </label>
      ) : null}
      {err ? (
        <p className="text-[13px] text-danger" role="alert">
          {err.message}
        </p>
      ) : null}
      <Button type="submit" variant="primary" loading={pending} className="self-start">
        {decision === "accepted" ? "Aceptar presupuesto" : "Enviar respuesta"}
      </Button>
    </form>
  );
}
