import { can, L, label } from "@agencyos/core";
import { agentDef } from "@agencyos/modules/ai/agents";
import { formatUsd } from "@agencyos/modules/ai/pricing";
import { listAgents, listRuns, providerState } from "@agencyos/modules/ai/queries";
import { AGENT_TOOLS } from "@agencyos/modules/ai/tools";
import { Badge, Card, EmptyState, PageHeader, SectionLabel } from "@agencyos/ui";
import { ChevronLeft, History, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AgentForm, AgentToggle, NewRunSheet } from "@/components/ai/ai-ui";
import { IA_ACCENT, modelOptions, RunList } from "@/components/ai/ia-shell";
import { requireCtx } from "@/lib/session";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  return { title: agentDef((await params).key)?.name ?? "Agente" };
}

export default async function AgentPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const def = agentDef(key);
  if (!def) notFound();
  const ctx = await requireCtx();
  if (!can(ctx, "update", "settings")) redirect("/ia");
  const state = await providerState(ctx);
  if (!state.configured) redirect("/ia");
  const [agents, runs] = await Promise.all([listAgents(ctx), listRuns(ctx, { agentKey: key, limit: 10 })]);
  const a = agents.find((x) => x.key === key);
  if (!a) notFound();

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/ia"
        className="-ml-1 mb-3 flex h-10 w-fit items-center gap-1 rounded-md px-1 font-mono text-[12px] uppercase tracking-[0.16em] text-text-muted hover:text-text"
      >
        <ChevronLeft className="size-4" /> IA
      </Link>
      <PageHeader
        eyebrow={`Agente · ${label(L.agentPermission, a.permissionLevel)}`}
        title={a.name}
        description={a.description}
        accent={IA_ACCENT}
        actions={
          <>
            <AgentToggle agentKey={a.key} name={a.name} enabled={a.enabled} />
            {a.enabled ? <NewRunSheet agents={[{ value: a.key, label: a.name }]} defaultAgent={a.key} /> : null}
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5 md:p-6">
          <SectionLabel icon={<SlidersHorizontal />} className="mb-4">
            Configuración
          </SectionLabel>
          <AgentForm
            agentKey={a.key}
            models={modelOptions()}
            tools={def.allowedTools.map((t) => ({
              name: t,
              label: AGENT_TOOLS[t]?.label ?? t,
              kind: AGENT_TOOLS[t]?.kind ?? "read",
              checked: a.tools.includes(t),
            }))}
            defaults={{
              modelId: a.modelId ?? "",
              monthlyBudgetUsd: a.monthlyBudget,
              budgetPerRunUsd: a.perRunBudget,
              maxSteps: a.maxStepsCfg,
              prompt: a.customPrompt ?? def.prompt,
            }}
            defaultPrompt={def.prompt}
          />
        </Card>
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <SectionLabel className="mb-3">Este mes</SectionLabel>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-text-muted">Gasto</dt>
              <dd className="text-right font-mono tabular-nums">{formatUsd(a.spentMonth)}</dd>
              <dt className="text-text-muted">Tope mensual</dt>
              <dd className="text-right font-mono tabular-nums">{formatUsd(a.monthlyBudget)}</dd>
              <dt className="text-text-muted">Ejecuciones</dt>
              <dd className="text-right font-mono tabular-nums">{a.runsMonth}</dd>
              <dt className="text-text-muted">Prompt</dt>
              <dd className="text-right">{a.customPrompt ? <Badge tone="accent">Editado · v{a.promptVersion}</Badge> : <Badge>Original</Badge>}</dd>
            </dl>
          </Card>
        </div>
      </div>
      <SectionLabel icon={<History />} className="mt-8 mb-3">
        Ejecuciones recientes
      </SectionLabel>
      {runs.length ? (
        <RunList runs={runs} names={{ [a.key]: a.name }} />
      ) : (
        <Card>
          <EmptyState
            compact
            icon={<History />}
            title={`${a.name} todavía no trabajó`}
            description="Cuando le pidas algo, vas a ver acá cada ejecución con su costo."
          />
        </Card>
      )}
    </div>
  );
}
