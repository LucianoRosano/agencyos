"use client";

import { Button, Input } from "@agencyos/ui";
import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { confirmPasswordAction } from "../actions";

export function ExportButton() {
  const [pw, setPw] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="flex flex-col gap-2 md:max-w-md md:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const r = await confirmPasswordAction(pw);
        if (!r.ok) {
          setPending(false);
          return toast.error(r.error.message);
        }
        const res = await fetch("/api/exportar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
        setPending(false);
        if (!res.ok) return toast.error("No se pudo exportar");
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `agencyos-export-${new Date().toISOString().slice(0, 10)}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
        setPw("");
      }}
    >
      <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Confirmá tu contraseña" aria-label="Contraseña" required />
      <Button type="submit" variant="primary" loading={pending}>
        <Download className="size-4" /> Exportar todo
      </Button>
    </form>
  );
}
