import { Card, SectionLabel } from "@agencyos/ui";
import { requireCtx } from "@/lib/session";
import { WorkspaceForm } from "./workspace-form";

export default async function WorkspacePage() {
  const ctx = await requireCtx();
  return (
    <Card className="p-5">
      <SectionLabel className="mb-1">Datos para documentos</SectionLabel>
      <p className="mb-4 text-[13px] text-text-muted">
        Así aparecés frente a tus clientes en presupuestos y constancias. El sistema se llama AGENCYOS; hacia afuera la marca es la tuya.
      </p>
      <WorkspaceForm s={ctx.workspace.settings} />
    </Card>
  );
}
