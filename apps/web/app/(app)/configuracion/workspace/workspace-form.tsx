"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { TextAreaField, TextField } from "@/components/fields";
import { saveWorkspaceAction } from "../actions";

export function WorkspaceForm({ s }: { s: Record<string, unknown> }) {
  const v = (k: string) => (s[k] === undefined || s[k] === null ? "" : String(s[k]));
  return (
    <ActionForm action={saveWorkspaceAction} successMessage="Datos guardados">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Nombre a mostrar" name="agencyName" defaultValue={v("agencyName") || "Luciano Rosano"} />
        <TextField label="Email de contacto" name="agencyEmail" type="email" defaultValue={v("agencyEmail")} />
        <TextField label="WhatsApp / teléfono" name="agencyPhone" defaultValue={v("agencyPhone")} placeholder="11 5526-0021" />
        <TextField label="Sitio web" name="agencyWebsite" defaultValue={v("agencyWebsite")} />
        <TextField label="Ciudad" name="agencyCity" defaultValue={v("agencyCity")} placeholder="San Miguel, Buenos Aires" />
      </div>
      <TextAreaField label="Pie de los presupuestos (opcional)" name="quoteFooter" defaultValue={v("quoteFooter")} rows={2} />
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Días sin actividad para marcar «frenado»" name="stalledDays" type="number" min={3} max={90} defaultValue={v("stalledDays") || "14"} />
        <TextField label="Límite sugerido de proyectos activos" name="maxActiveProjects" type="number" min={1} max={50} defaultValue={v("maxActiveProjects") || "8"} />
      </div>
      <SubmitButton className="self-start">Guardar</SubmitButton>
    </ActionForm>
  );
}
