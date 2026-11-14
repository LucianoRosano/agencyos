import { can, formatDateTime } from "@agencyos/core";
import { MODEL_PRICES } from "@agencyos/modules/ai/pricing";
import { providerState } from "@agencyos/modules/ai/queries";
import { Badge, Card, SectionLabel } from "@agencyos/ui";
import { KeyRound, Receipt } from "lucide-react";
import { redirect } from "next/navigation";
import { ProviderActions, ProviderForm } from "@/components/ai/ai-ui";
import { IaHeader, modelOptions } from "@/components/ai/ia-shell";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Configuración de IA" };

export default async function IaConfigPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "update", "settings")) redirect("/ia");
  const state = await providerState(ctx);
  if (!state.configured) redirect("/ia");
  return (
    <div className="mx-auto max-w-6xl">
      <IaHeader active="configuracion" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionLabel icon={<KeyRound />}>Proveedor · Anthropic</SectionLabel>
            <Badge tone={state.lastError ? "danger" : state.lastOkAt ? "success" : "neutral"}>
              {state.lastError ? "Error de conexión" : state.lastOkAt ? `Probada ${formatDateTime(state.lastOkAt)}` : "Sin probar"}
            </Badge>
          </div>
          <p className="mb-4 text-[14px] text-text">
            Clave configurada · termina en <span className="font-mono">…{state.keyLast4 ?? "????"}</span>
          </p>
          {state.lastError ? <p className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-3 text-[13px] text-danger">{state.lastError}</p> : null}
          <ProviderForm models={modelOptions()} defaults={{ model: state.model, monthlyBudgetUsd: state.monthlyBudgetUsd ?? "10" }} keyLast4={state.keyLast4} />
          <div className="mt-5 border-t border-border pt-5">
            <ProviderActions />
          </div>
        </Card>
        <Card className="p-5">
          <SectionLabel icon={<Receipt />} className="mb-3">
            Precios de referencia
          </SectionLabel>
          <p className="mb-3 text-[13px] text-text-muted">US$ por millón de tokens. El costo de cada ejecución se estima con esta tabla.</p>
          <ul className="flex flex-col gap-2 text-[13px]">
            {Object.entries(MODEL_PRICES).map(([id, m]) => (
              <li key={id} className="flex flex-col rounded-md border border-border p-2.5">
                <span className="text-text">{m.label.replace(/ \(.*\)$/, "")}</span>
                <span className="font-mono text-[12px] text-text-muted">
                  entrada {m.inputPerM.replace(".", ",")} · salida {m.outputPerM.replace(".", ",")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
