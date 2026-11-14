import { can, L } from "@agencyos/core";
import { AGENTS } from "@agencyos/modules/ai/agents";
import { listRuns, providerState } from "@agencyos/modules/ai/queries";
import { Button, Card, EmptyState, Select } from "@agencyos/ui";
import { History } from "lucide-react";
import { redirect } from "next/navigation";
import { IaHeader, RunList } from "@/components/ai/ia-shell";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Ejecuciones de agentes" };

export default async function RunsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  if (!can(ctx, "update", "settings")) redirect("/ia");
  const state = await providerState(ctx);
  const agentKey = AGENTS.some((a) => a.key === sp.agente) ? sp.agente : undefined;
  const status = sp.estado && sp.estado in L.agentRunStatus ? sp.estado : undefined;
  const runs = await listRuns(ctx, { agentKey, status, limit: 200 });
  if (!state.configured && !runs.length && !agentKey && !status) redirect("/ia");
  const names = Object.fromEntries(AGENTS.map((a) => [a.key, a.name]));

  return (
    <div className="mx-auto max-w-6xl">
      <IaHeader active={state.configured ? "ejecuciones" : undefined} />
      <form action="/ia/ejecuciones" className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select name="agente" defaultValue={agentKey ?? ""} aria-label="Agente" className="sm:max-w-56">
          <option value="">Todos los agentes</option>
          {AGENTS.map((a) => (
            <option key={a.key} value={a.key}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select name="estado" defaultValue={status ?? ""} aria-label="Estado" className="sm:max-w-56">
          <option value="">Todos los estados</option>
          {Object.entries(L.agentRunStatus).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      {runs.length ? (
        <RunList runs={runs} names={names} />
      ) : (
        <Card>
          <EmptyState
            icon={<History />}
            title={agentKey || status ? "No hay ejecuciones con esos filtros" : "Todavía no hay ejecuciones"}
            description="Cada pedido a un agente aparece acá con su estado, costo, duración y la traza paso a paso."
            action={
              agentKey || status ? (
                <Button asChild variant="secondary">
                  <a href="/ia/ejecuciones">Ver todas</a>
                </Button>
              ) : (
                <Button asChild variant="primary">
                  <a href="/ia">Hacer un pedido</a>
                </Button>
              )
            }
          />
        </Card>
      )}
    </div>
  );
}
