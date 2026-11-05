"use client";

import { BookmarkPlus, X } from "lucide-react";
import { deleteViewAction, saveViewAction } from "@/app/actions/collab";
import { useAction } from "@/components/use-action";

export function SaveViewButton({ module, query }: { module: string; query: string }) {
  const { pending, exec } = useAction();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const name = prompt("Nombre de la vista (p. ej. «Clientes activos con deuda»)")?.trim();
        if (name) exec(() => saveViewAction(module, name, query), { success: `Vista «${name}» guardada` });
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-[12px] text-text-muted hover:text-text"
    >
      <BookmarkPlus className="size-3.5" /> Guardar vista
    </button>
  );
}

export function DeleteViewButton({ id, name }: { id: string; name: string }) {
  const { pending, exec } = useAction();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => confirm(`¿Borrar la vista «${name}»?`) && exec(() => deleteViewAction(id), { success: "Vista borrada" })}
      className="-ml-1 grid size-8 place-items-center rounded-full text-text-faint hover:text-text"
      aria-label={`Borrar vista ${name}`}
    >
      <X className="size-3.5" />
    </button>
  );
}
