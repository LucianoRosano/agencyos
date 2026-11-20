"use client";

import { Button } from "@agencyos/ui";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { startEntityRunAction } from "@/app/(app)/ia/actions";
import { useAction } from "@/components/use-action";

/** Botón «Pedir a un agente» de las fichas (proyecto, sitio, nota): módulo propio para no arrastrar toda la UI de IA. */
export function AgentEntryButton({ entityType, entityId, label }: { entityType: "project" | "site" | "note"; entityId: string; label: string }) {
  const { exec, pending } = useAction();
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        exec(() => startEntityRunAction(entityType, entityId), {
          success: "Pedido en cola: el resultado queda como comentario y te aviso.",
          onDone: (id) => router.push(`/ia/ejecuciones/${id}`),
        })
      }
    >
      <Sparkles className="size-4" /> {label}
    </Button>
  );
}
