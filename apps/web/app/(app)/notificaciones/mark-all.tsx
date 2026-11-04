"use client";

import { Button } from "@agencyos/ui";
import { useAction } from "@/components/use-action";
import { markAllReadAction } from "./actions";

export function MarkAllRead() {
  const { exec, pending } = useAction();
  return <Button variant="secondary" loading={pending} onClick={() => exec(() => markAllReadAction(), { success: "Todo marcado como leído" })}>Marcar todo como leído</Button>;
}
