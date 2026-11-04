"use client";

import { Button } from "@agencyos/ui";
import { useAction } from "@/components/use-action";
import { purgeAction, restoreAction } from "./actions";

export function TrashActions({ type, id, title }: { type: string; id: string; title: string }) {
  const { exec, pending } = useAction();
  return (
    <div className="flex gap-2">
      <Button size="sm" loading={pending} onClick={() => exec(() => restoreAction(type, id), { success: "Restaurado" })}>
        Restaurar
      </Button>
      <Button
        size="sm"
        variant="danger"
        loading={pending}
        onClick={() => {
          if (confirm(`¿Eliminar «${title}» definitivamente? No se puede deshacer.`))
            exec(() => purgeAction(type, id), { success: "Eliminado definitivamente" });
        }}
      >
        Eliminar definitivamente
      </Button>
    </div>
  );
}
