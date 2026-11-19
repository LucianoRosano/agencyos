"use client";

import { captureAction } from "@/app/actions/shell";
import { ActionForm, SubmitButton } from "@/components/action-form";

export function ShareForm({ initial }: { initial: string }) {
  return (
    <ActionForm action={captureAction} successMessage="Guardado en la Bandeja" redirectTo="/bandeja">
      <label htmlFor="share-text" className="text-[13px] text-text-muted">
        Qué querés guardar
      </label>
      <textarea
        id="share-text"
        name="text"
        required
        autoFocus
        defaultValue={initial}
        maxLength={2000}
        placeholder="Un link, una idea, una tarea…"
        className="min-h-40 w-full resize-y rounded-[var(--radius-control)] border border-border bg-bg-elevated p-3 text-base text-text placeholder:text-text-faint focus:border-accent focus:outline-none md:text-sm"
      />
      <SubmitButton className="self-end">Guardar en la Bandeja</SubmitButton>
    </ActionForm>
  );
}
