"use client";

import { useAction } from "@/components/use-action";
import { deleteTemplateAction } from "../actions";

export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const { exec, pending } = useAction();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-[13px] text-text-muted hover:text-danger"
      onClick={() => {
        if (confirm(`¿Eliminar la plantilla «${name}»?`)) exec(() => deleteTemplateAction(id), { success: "Plantilla en la papelera" });
      }}
    >
      Eliminar
    </button>
  );
}
