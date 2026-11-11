import { can, L, label } from "@agencyos/core";
import { DEFAULT_MODEL, formatUsd, usdToMicro } from "@agencyos/modules/ai/pricing";
import { listAgents, listRuns, monthUsage, providerState } from "@agencyos/modules/ai/queries";
import { Badge, BlockCard, Button, Card, EmptyState, HBars, Progress, SectionLabel, Sparkline } from "@agencyos/ui";
import { Bot, Gauge, History, KeyRound, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { AgentToggle, NewRunSheet, ProviderForm } from "@/components/ai/ai-ui";
import { IaHeader, modelOptions, RunList } from "@/components/ai/ia-shell";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "IA" };

export default async function IaPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "update", "settings")) {
    return (
      <div className="mx-auto max-w-6xl">
        <IaHeader />
        <EmptyState
          icon={<ShieldCheck />}
          title="Solo el dueño o un admin configura la IA"
          description="Los agentes gastan dinero de la cuenta de Anthropic de la agencia."
        />
      </div>
    );
  }
  const state = await providerState(ctx);

  if (!state.configured) {
    return (
      <div className="mx-auto max-w-3xl">
        <IaHeader description="Conectá tu cuenta de Anthropic para activar los agentes internos. Mientras no haya clave, no aparece ningún botón de agentes en el resto de AGENCYOS." />
        <Card className="p-5 md:p-6">
          <SectionLabel icon={<KeyRound />} className="mb-4">
            Conectar Anthropic
          </SectionLabel>
          <ProviderForm
            models={modelOptions()}
            defaults={{ model: state.model ?? DEFAULT_MODEL, monthlyBudgetUsd: state.monthlyBudgetUsd ?? "10" }}
            keyLast4={null}
          />
        </Card>
        <ul className="mt-5 grid gap-3 text-[13px] text-text-muted md:grid-cols-3">
          <li className="rounded-[var(--radius-card)] border border-border p-4">
            <p className="mb-1 font-medium text-text">Pago por uso, con tope</p>
            Cada ejecución registra tokens y costo estimado. Al llegar al tope mensual, ningún agente arranca.
          </li>
          <li className="rounded-[var(--radius-card)] border border-border p-4">
            <p className="mb-1 font-medium text-text">Sin poderes propios</p>
            Usan las mismas herramientas que Claude por MCP, con alcances limitados por agente.
          </li>
          <li className="rounded-[var(--radius-card)] border border-border p-4">
            <p className="mb-1 font-medium text-text">Humano en el bucle</p>
            Lo que excede su alcance queda como aprobación para que decidas vos.
          </li>
        </ul>
      </div>
    );
  }

  const [agents, usage, recent] = await Promise.all([listAgents(ctx), monthUsage(ctx), listRuns(ctx, { limit: 5 })]);
  const cap = state.monthlyBudgetUsd ?? "0";
  const capMicro = usdToMicro(cap);
  const pct = capMicro > 0n ? Number((usdToMicro(usage.total) * 10000n) / capMicro) / 100 : 0;
  const names = Object.fromEntries(agents.map((a) => [a.key, a.name]));
  const enabled = agents.filter((a) => a.enabled);
  const spent = agents.filter((a) => usdToMicro(a.spentMonth) > 0n);

  return (
    <div className="mx-auto max-w-6xl">
      <IaHeader active="resumen" actions={enabled.length ? <NewRunSheet agents={enabled.map((a) => ({ value: a.key, label: a.name }))} /> : null} />

      <div className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <BlockCard icon={<Wallet />} title="Uso del mes">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="font-mono text-[28px] font-semibold tabular-nums tracking-tight text-text">{formatUsd(usage.total)}</p>
            <p className="text-[13px] text-text-muted">
              de {formatUsd(cap)} · {usage.runs} ejecuciones
            </p>
          </div>
          <Progress value={pct} tone={pct >= 90 ? "warning" : "gradient"} className="mt-3" label={`Uso del tope mensual ${Math.round(pct)}%`} />
          <div className="mt-4">
            {usage.series.some((d) => d.value > 0) ? (
              <>
                <Sparkline values={usage.series.map((d) => d.value)} className="h-10" />
                <p className="mt-1 flex justify-between font-mono text-[11px] text-text-faint">
                  <span>1/{usage.month.slice(5, 7)}</span>
                  <span>hoy</span>
                </p>
              </>
            ) : (
              <p className="text-[13px] text-text-faint">Todavía no hubo gasto este mes.</p>
            )}
          </div>
          <p className="mt-3 font-mono text-[12px] text-text-muted">
            {usage.tokensIn.toLocaleString("es-AR")} tokens de entrada · {usage.tokensOut.toLocaleString("es-AR")} de salida
          </p>
        </BlockCard>
        <BlockCard icon={<Gauge />} title="Gasto por agente">
          {spent.length ? (
            <HBars data={spent.map((a) => ({ label: a.name, value: Number(usdToMicro(a.spentMonth)), display: formatUsd(a.spentMonth) }))} />
          ) : (
            <EmptyState compact icon={<Gauge />} title="Sin gasto este mes" description="Cuando un agente trabaje, vas a ver acá cuánto gastó cada uno." />
          )}
        </BlockCard>
      </div>

      <SectionLabel icon={<Bot />} className="mb-3">
        Agentes
      </SectionLabel>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => {
          const used = usdToMicro(a.spentMonth);
          const lim = usdToMicro(a.monthlyBudget);
          return (
            <Card key={a.key} className={`flex flex-col p-4 ${a.enabled ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold text-text">{a.name}</h2>
                  <p className="mt-0.5 text-[13px] text-text-muted">{a.description}</p>
                </div>
                <AgentToggle agentKey={a.key} name={a.name} enabled={a.enabled} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge>{label(L.agentPermission, a.permissionLevel).split(" (")[0]}</Badge>
                <Badge>{a.tools.length} herramientas</Badge>
                {a.customPrompt ? <Badge tone="accent">Prompt v{a.promptVersion}</Badge> : null}
              </div>
              <div className="mt-auto pt-4">
                <div className="mb-1.5 flex justify-between font-mono text-[12px] tabular-nums text-text-muted">
                  <span>{formatUsd(a.spentMonth)}</span>
                  <span>tope {formatUsd(a.monthlyBudget)}</span>
                </div>
                <Progress value={lim > 0n ? Number((used * 100n) / lim) : 0} label={`Gasto de ${a.name} sobre su tope`} />
                <div className="mt-3 flex justify-end">
                  <Button asChild variant="ghost" size="sm" className="h-11 md:h-8">
                    <Link href={`/ia/agentes/${a.key}`} aria-label={`Configurar ${a.name}`}>
                      Configurar
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <SectionLabel icon={<History />}>Últimas ejecuciones</SectionLabel>
        {recent.length ? (
          <Link href="/ia/ejecuciones" className="flex h-11 items-center text-[13px] text-text-muted hover:text-text md:h-auto">
            Ver todas
          </Link>
        ) : null}
      </div>
      {recent.length ? (
        <RunList runs={recent} names={names} />
      ) : (
        <Card>
          <EmptyState
            icon={<History />}
            title="Todavía no le pediste nada a un agente"
            description="Hacé un pedido acá o desde la ficha de un proyecto, sitio o nota. Cada paso queda registrado."
            action={enabled.length ? <NewRunSheet agents={enabled.map((x) => ({ value: x.key, label: x.name }))} /> : undefined}
          />
        </Card>
      )}
    </div>
  );
}
