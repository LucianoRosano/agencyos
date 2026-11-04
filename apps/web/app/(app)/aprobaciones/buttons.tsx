"use client";

import { Button } from "@agencyos/ui";
import { useAction } from "@/components/use-action";
import { approveAction, rejectAction } from "./actions";

export function ApprovalButtons({ id }: { id: string }) {
  const { exec, pending } = useAction();
  return (
    <div className="mt-3 flex gap-2">
      <Button variant="primary" loading={pending} onClick={() => exec(() => approveAction(id), { success: "Aprobada: quedó una tarea para hoy" })}>Aprobar</Button>
      <Button variant="ghost" loading={pending} onClick={() => exec(() => rejectAction(id), { success: "Rechazada" })}>Rechazar</Button>
    </div>
  );
}
