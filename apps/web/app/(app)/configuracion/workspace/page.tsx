import { Card, SectionLabel } from "@agencyos/ui";
import { TargetRateForm } from "@/components/time/target-rate-form";
import { requireCtx } from "@/lib/session";
import { WorkspaceForm } from "./workspace-form";

export default async function WorkspacePage() {
  const ctx = await requireCtx();
  const st = ctx.workspace.settings as { targetHourlyRate?: string; targetHourlyCurrency?: string };
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <SectionLabel className="mb-1">Datos para documentos</SectionLabel>
        <p className="mb-4 text-[13px] text-text-muted">
          Así aparecés frente a tus clientes en presupuestos y constancias. El sistema se llama AGENCYOS; hacia afuera la marca es la tuya.
        </p>
        <WorkspaceForm s={ctx.workspace.settings} />
      </Card>
      <Card className="p-5">
        <SectionLabel className="mb-1">Rentabilidad por hora</SectionLabel>
        <p className="mb-4 text-[13px] text-text-muted">
          Con las horas registradas se calcula la tarifa efectiva (cobrado ÷ horas) de cada proyecto y cliente. Si definís un objetivo, se marca si estás por
          encima o por debajo.
        </p>
        <TargetRateForm amount={st.targetHourlyRate?.replace(/\.00$/, "") ?? ""} currency={st.targetHourlyCurrency ?? "ARS"} />
      </Card>
    </div>
  );
}
