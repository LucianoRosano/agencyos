"use client";

import { L } from "@agencyos/core";
import { Sheet } from "@agencyos/ui";
import { useEffect, useRef, useState } from "react";
import { captureAction } from "@/app/actions/shell";
import { ActionForm, SubmitButton } from "../action-form";

const TYPES = Object.entries(L.inboxType);

export function CaptureDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
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
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setText(""); }} title="Capturar" description="Anotalo ahora, ordenalo después desde la Bandeja.">
      <ActionForm
        action={captureAction}
        successMessage="Guardado en la Bandeja"
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
