"use client";

import { Button } from "@agencyos/ui";
import { RefreshCw } from "lucide-react";
import { useAction } from "@/components/use-action";
import { indexNowAction } from "./actions";

export function IndexNowButton() {
  const { exec, pending } = useAction();
  return (
    <Button variant="ghost" size="sm" className="h-10" loading={pending} onClick={() => exec(() => indexNowAction(), { success: "Cerebro al día" })}>
      <RefreshCw className="size-4" /> Indexar ahora
    </Button>
  );
}
