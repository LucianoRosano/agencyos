"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { saveModulesAction } from "../actions";

export function ModulesForm({ modules, enabled }: { modules: { key: string; label: string; description: string }[]; enabled: string[] }) {
  return (
    <ActionForm action={saveModulesAction} successMessage="Módulos actualizados">
      <div className="grid gap-1 md:grid-cols-2">
        {modules.map((m) => (
          <label key={m.key} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-surface-2">
            <input type="checkbox" name="modules" value={m.key} defaultChecked={enabled.includes(m.key)} className="mt-1 size-4 accent-[var(--accent)]" />
            <span>
              <span className="block text-[14px] text-text">{m.label}</span>
              <span className="block text-[12px] text-text-muted">{m.description}</span>
            </span>
          </label>
        ))}
      </div>
      <SubmitButton className="self-start">Guardar</SubmitButton>
    </ActionForm>
  );
}
