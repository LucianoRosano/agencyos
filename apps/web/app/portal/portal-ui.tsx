"use client";

import { Button, Checkbox, cn, Field, Input, Sheet, Textarea } from "@agencyos/ui";
import { Check, ImagePlus, LogOut, MessageSquareWarning, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { getAuthClient } from "@/lib/auth-client-lazy";
import { toast } from "@/lib/toast";
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
          await (await getAuthClient()).signOut();
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

const CAPTURE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const CAPTURE_MAX = 10 * 1024 * 1024;

/** Sube la captura de un ítem (route handler: el cuerpo de una Server Action está limitado a 2 MB). */
async function uploadCapture(itemId: string, file: File): Promise<string | null> {
  try {
    const res = await fetch(`/portal/capturas?item=${encodeURIComponent(itemId)}`, {
      method: "POST",
      headers: { "X-File-Name": encodeURIComponent(file.name), "Content-Type": "application/octet-stream" },
      body: file,
    });
    const r = (await res.json().catch(() => null)) as { ok: boolean; error?: { message: string } } | null;
    return r?.ok ? null : (r?.error?.message ?? "No se pudo subir la captura.");
  } catch {
    return "No se pudo subir la captura. Revisá tu conexión.";
  }
}

/** Cargar un ítem de feedback en la ronda de revisión abierta, con una captura opcional (PNG, JPG o WebP; hasta 10 MB). */
export function FeedbackForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const pick = (f: File | null) => {
    setFileError(null);
    if (!f) return setFile(null);
    if (!CAPTURE_TYPES.includes(f.type)) {
      setFileError("La captura tiene que ser PNG, JPG o WebP.");
      if (input.current) input.current.value = "";
      return setFile(null);
    }
    if (f.size > CAPTURE_MAX) {
      setFileError("La captura supera los 10 MB.");
      if (input.current) input.current.value = "";
      return setFile(null);
    }
    setFile(f);
  };
  const clear = () => {
    setFile(null);
    setFileError(null);
    if (input.current) input.current.value = "";
  };
  return (
    <ActionForm
      action={feedbackAction.bind(null, projectId)}
      successMessage={file ? undefined : "Feedback cargado"}
      resetOnSuccess
      onSuccess={async (data) => {
        const capture = file;
        clear();
        if (!capture) return;
        const itemId = (data as { id: string | null } | null)?.id;
        const err = itemId ? await uploadCapture(itemId, capture) : "No se pudo adjuntar la captura.";
        if (err) toast.error(`El feedback se cargó, pero la captura no: ${err}`);
        else toast.success("Feedback y captura cargados");
        router.refresh();
      }}
    >
      <TextField label="Página o sección" name="pageRef" placeholder="Ej.: Inicio, Contacto" autoComplete="off" />
      <TextAreaField label="¿Qué viste?" name="description" rows={3} required />
      <SelectField label="Prioridad" name="priority" defaultValue="3" options={PRIORITIES} />
      <Field label="Captura (opcional)" name="capture" error={fileError ?? undefined} hint="PNG, JPG o WebP, hasta 10 MB.">
        <div className="flex flex-wrap items-center gap-2">
          {/* Sin `name`: la imagen no viaja en la Server Action (límite 2 MB); se sube aparte. */}
          <input
            ref={input}
            id="capture"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="secondary" onClick={() => input.current?.click()}>
            <ImagePlus className="size-4" /> {file ? "Cambiar captura" : "Adjuntar captura"}
          </Button>
          {file ? (
            <span className="flex min-w-0 items-center gap-1 text-[13px] text-text-muted" data-testid="capture-name">
              <span className="max-w-[220px] truncate">{file.name}</span>
              <Button type="button" variant="ghost" size="icon" aria-label="Quitar la captura" onClick={clear}>
                <X className="size-4" />
              </Button>
            </span>
          ) : null}
        </div>
      </Field>
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
