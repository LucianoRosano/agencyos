import { OPTIONAL_MODULES } from "@agencyos/modules/settings/service";
import { Card } from "@agencyos/ui";
import { requireCtx } from "@/lib/session";
import { ModulesForm } from "./modules-form";

export default async function ModulesPage() {
  const ctx = await requireCtx();
  return (
    <Card className="p-5">
      <p className="mb-4 text-[13px] text-text-muted">Los módulos apagados desaparecen de la navegación (no se borra nada).</p>
      <ModulesForm modules={OPTIONAL_MODULES.map((m) => ({ ...m }))} enabled={ctx.workspace.enabledModules} />
    </Card>
  );
}
