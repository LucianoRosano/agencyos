"use client";

import { Button, Select } from "@agencyos/ui";
import { LayoutTemplate } from "lucide-react";
import { useState } from "react";
import { applyTemplateAction, restoreBlueprintAction } from "@/app/(app)/sitios/actions";
import { useAction } from "@/components/use-action";

/** Generar la estructura desde una plantilla por tipo de sitio. */
export function TemplatePicker({
  siteId,
  kind,
  currentVersion,
  templates,
}: {
  siteId: string;
  kind: string;
  currentVersion: number | null;
  templates: { value: string; label: string }[];
}) {
  const hasTree = currentVersion !== null;
  const [value, setValue] = useState(templates.some((t) => t.value === kind) ? kind : (templates[0]?.value ?? "institutional"));
  const { exec, pending } = useAction();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select aria-label="Plantilla de estructura" value={value} onChange={(e) => setValue(e.target.value)} className="sm:w-48">
        {templates.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <Button
        variant={hasTree ? "secondary" : "primary"}
        loading={pending}
        onClick={() => {
          if (
            hasTree &&
            !confirm("Se crea una versión nueva con la plantilla. Los slots que no estén en la plantilla se archivan (con su contenido). ¿Seguir?")
          )
            return;
          exec(() => applyTemplateAction(siteId, value), {
            success: "Estructura generada desde la plantilla",
            undo: currentVersion !== null ? () => restoreBlueprintAction(siteId, currentVersion) : undefined,
          });
        }}
      >
        <LayoutTemplate className="size-4" /> Generar desde plantilla
      </Button>
    </div>
  );
}

export function RestoreVersionButton({ siteId, version }: { siteId: string; version: number }) {
  const { exec, pending } = useAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-10"
      loading={pending}
      onClick={() => {
        if (!confirm(`¿Restaurar la versión ${version}? Se guarda como una versión nueva; la historia no se pierde.`)) return;
        exec(() => restoreBlueprintAction(siteId, version), { success: `Versión ${version} restaurada como versión nueva` });
      }}
    >
      Restaurar
    </Button>
  );
}
