import { can } from "@agencyos/core";
import { listPipelineStages } from "@agencyos/modules/crm/stages";
import { Card, EmptyState, SectionLabel } from "@agencyos/ui";
import { Lock } from "lucide-react";
import { StagesEditor } from "@/components/crm/stages-editor";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Configuración · CRM" };

export default async function CrmSettingsPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "manage", "settings")) {
    return (
      <Card className="p-2">
        <EmptyState
          icon={<Lock />}
          title="Solo administración"
          description="Las etapas del pipeline las edita el dueño o un administrador del espacio de trabajo."
        />
      </Card>
    );
  }
  const stages = await listPipelineStages(ctx);
  return (
    <Card className="p-5">
      <SectionLabel className="mb-1">Etapas del pipeline</SectionLabel>
      <p className="mb-5 text-[13px] text-text-muted">
        Renombrá las etapas, ajustá la probabilidad que toma una oportunidad al entrar y agregá etapas intermedias. «Ganada» y «Perdida» cierran el pipeline y
        las etapas del sistema no se eliminan.
      </p>
      <StagesEditor stages={stages} />
    </Card>
  );
}
