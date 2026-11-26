"use client";

import { Button } from "@agencyos/ui";
import { CheckCheck } from "lucide-react";
import { useAction } from "@/components/use-action";
import { markAllReadAction, markUnreadManyAction } from "./actions";

/** «Todo leído» con Deshacer (vuelve a marcar sin leer exactamente los que se marcaron). */
export function MarkAllRead() {
  const { exec, pending } = useAction();
  let ids: string[] = [];
  return (
    <Button
      variant="secondary"
      loading={pending}
      onClick={() =>
        exec(() => markAllReadAction(), {
          success: "Todo marcado como leído",
          onDone: (d) => {
            ids = (d as { ids: string[] }).ids;
          },
          undo: () => markUnreadManyAction(ids),
        })
      }
    >
      <CheckCheck className="size-4" aria-hidden /> Todo leído
    </Button>
  );
}
