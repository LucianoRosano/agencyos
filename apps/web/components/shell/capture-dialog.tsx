"use client";

import { L } from "@agencyos/core";
import { Sheet } from "@agencyos/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { captureAction } from "@/app/actions/shell";
import { flushCaptures, queueCapture } from "@/lib/offline-captures";
import { toast } from "@/lib/toast";
import { ActionForm, SubmitButton } from "../action-form";

type CaptureResult = Awaited<ReturnType<typeof captureAction>>;
const QUEUED = { ok: true, data: { queued: true } } as unknown as CaptureResult;

/** Sin señal (o si el envío falla por red), la captura queda en el dispositivo y se sube al volver la conexión. */
async function submitCapture(prev: CaptureResult | null, fd: FormData): Promise<CaptureResult> {
  if (!navigator.onLine) {
    queueCapture(fd);
    return QUEUED;
  }
  try {
    return await captureAction(prev, fd);
  } catch {
    queueCapture(fd);
    return QUEUED;
  }
}

const TYPES = Object.entries(L.inboxType);

export function CaptureDialog({ initialOpen = false, initialText = "" }: { initialOpen?: boolean; initialText?: string }) {
  const [open, setOpen] = useState(initialOpen);
  const [text, setText] = useState(initialText);
  const ref = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  // Al montar (cada pantalla de la app) y al volver la conexión: subir lo capturado sin señal.
  useEffect(() => {
    const flush = () =>
      void flushCaptures((fd) => captureAction(null, fd)).then((n) => {
        if (!n) return;
        toast.success(n === 1 ? "Se subió a la Bandeja 1 captura hecha sin conexión" : `Se subieron a la Bandeja ${n} capturas hechas sin conexión`);
        router.refresh();
      });
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [router]);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onText = (e: Event) => setText(String((e as CustomEvent).detail ?? ""));
    window.addEventListener("ag:capture", onOpen);
    window.addEventListener("ag:capture-text", onText);
    return () => {
      window.removeEventListener("ag:capture", onOpen);
      window.removeEventListener("ag:capture-text", onText);
    };
  }, []);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setText("");
      }}
      title="Capturar"
      description="Anotalo ahora, ordenalo después desde la Bandeja."
    >
      <ActionForm
        action={submitCapture}
        successMessage={(d) =>
          (d as { queued?: boolean } | null)?.queued ? "Sin conexión: quedó en este dispositivo y se sube solo al volver" : "Guardado en la Bandeja"
        }
        onSuccess={() => {
          setOpen(false);
          setText("");
        }}
      >
        <textarea
          ref={ref}
          name="text"
          autoFocus
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Una tarea, una idea, un gasto, un link…"
          className="min-h-28 w-full resize-none rounded-[var(--radius-control)] border border-border bg-bg-elevated p-3 text-base text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Tipo (opcional)</legend>
          {TYPES.map(([value, lbl]) => (
            <label key={value} className="cursor-pointer">
              <input type="radio" name="suggestedType" value={value} className="peer sr-only" />
              <span className="inline-flex h-9 items-center rounded-full border border-border px-3.5 text-[13px] text-text-muted peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-text peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                {lbl}
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex items-center justify-between">
          <span className="hidden text-[12px] text-text-faint md:inline">Enter para guardar · Shift+Enter nueva línea</span>
          <SubmitButton className="ml-auto">Guardar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}
