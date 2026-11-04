"use client";

import { Button } from "@agencyos/ui";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      <Printer className="size-4" /> Imprimir o guardar PDF
    </Button>
  );
}
