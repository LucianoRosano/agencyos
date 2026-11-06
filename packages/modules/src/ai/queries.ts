import { type Ctx, can, todayAR, toISODateAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../shared/db";
import { AGENTS, type AgentDef, agentDef } from "./agents";
import { DEFAULT_MODEL, microToUsd, usdToMicro } from "./pricing";
import { loadProvider } from "./provider";
import { monthStartAR } from "./service";

/** Estado del proveedor SIN la clave: solo si está cargada y sus últimos 4 caracteres. */
export async function providerState(ctx: Ctx) {
  const p = await loadProvider(getDb(), ctx.workspaceId);
  return {
    configured: Boolean(p?.cfg.enabled && p.hasKey),
    hasKey: Boolean(p?.hasKey),
    keyLast4: p?.hasKey ? (p.config.keyLast4 ?? null) : null,
    model: p?.model ?? DEFAULT_MODEL,
    monthlyBudgetUsd: p?.cfg.monthlyBudgetUsd ?? null,
    lastOkAt: p?.integration?.lastOkAt ?? null,
    lastError: p?.integration?.lastError ?? null,
    customPrompts: Object.keys(p?.config.agentPrompts ?? {}),
    prompts: p?.config.agentPrompts ?? {},
  };
}

export type ProviderState = Awaited<ReturnType<typeof providerState>>;

/**
 * Para las fichas: qué agentes están disponibles. Vacío si no hay proveedor configurado o si la persona
 * no puede pedir ejecuciones (regla: nada decorativo, sin clave no se muestran botones).
 */
export async function availableAgents(ctx: Ctx): Promise<Set<string>> {
  if (ctx.actor.type !== "user" || !can(ctx, "update", "settings")) return new Set();
  const p = await loadProvider(getDb(), ctx.workspaceId);
  if (!p?.cfg.enabled || !p.hasKey) return new Set();
  const rows = await getDb()
    .select({ key: schema.agent.key })
    .from(schema.agent)
    .where(and(eq(schema.agent.workspaceId, ctx.workspaceId), eq(schema.agent.enabled, true)));
  return new Set(rows.map((r) => r.key));
}

export type AgentView = AgentDef & {
  id: string | null;
  enabled: boolean;
  tools: string[];
  modelId: string | null;
  monthlyBudget: string;
  perRunBudget: string;
  maxStepsCfg: number;
  promptVersion: string;
  customPrompt: string | null;
  spentMonth: string;
  runsMonth: number;
};

/** Agentes del catálogo con su configuración y gasto del mes. */
export async function listAgents(ctx: Ctx): Promise<AgentView[]> {
  const db = getDb();
  const [rows, spend, p] = await Promise.all([
    db.select().from(schema.agent).where(eq(schema.agent.workspaceId, ctx.workspaceId)),
    db
      .select({
        key: schema.agentRun.agentKey,
        total: sql<string>`coalesce(sum(${schema.agentRun.costUsd}), 0)::text`,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.agentRun)
      .where(and(eq(schema.agentRun.workspaceId, ctx.workspaceId), gte(schema.agentRun.startedAt, monthStartAR())))
      .groupBy(schema.agentRun.agentKey),
    loadProvider(db, ctx.workspaceId),
  ]);
  return AGENTS.map((def) => {
    const r = rows.find((x) => x.key === def.key);
    const s = spend.find((x) => x.key === def.key);
    return {
      ...def,
      id: r?.id ?? null,
      enabled: r?.enabled ?? false,
      tools: r?.tools ?? def.defaultTools,
      modelId: r?.modelId ?? null,
      monthlyBudget: r?.monthlyBudgetUsd ?? def.monthlyBudgetUsd,
      perRunBudget: r?.budgetPerRunUsd ?? def.budgetPerRunUsd,
      maxStepsCfg: r?.maxSteps ?? def.maxSteps,
      promptVersion: r?.systemPromptVersion ?? "1",
      customPrompt: p?.config.agentPrompts?.[def.key] ?? null,
      spentMonth: microToUsd(usdToMicro(s?.total ?? "0")),
      runsMonth: s?.n ?? 0,
    };
  });
}

/** Uso del mes: total, tope y serie diaria (para el gráfico). Agrupado por día en hora Argentina. */
export async function monthUsage(ctx: Ctx) {
  const today = todayAR();
  const month = today.slice(0, 7);
  const rows = await getDb()
    .select({ at: schema.agentRun.startedAt, cost: schema.agentRun.costUsd, tokensIn: schema.agentRun.tokensIn, tokensOut: schema.agentRun.tokensOut })
    .from(schema.agentRun)
    .where(and(eq(schema.agentRun.workspaceId, ctx.workspaceId), gte(schema.agentRun.startedAt, monthStartAR(today))));
  const byDay = new Map<string, bigint>();
  for (const r of rows) {
    const d = toISODateAR(r.at);
    byDay.set(d, (byDay.get(d) ?? 0n) + usdToMicro(r.cost));
  }
  const days = Number(today.slice(8, 10));
  const series = Array.from({ length: days }, (_, i) => {
    const d = `${month}-${String(i + 1).padStart(2, "0")}`;
    return { day: d, micro: byDay.get(d) ?? 0n };
  });
  const totalMicro = series.reduce((a, x) => a + x.micro, 0n);
  return {
    month,
    total: microToUsd(totalMicro),
    runs: rows.length,
    tokensIn: rows.reduce((a, r) => a + r.tokensIn, 0),
    tokensOut: rows.reduce((a, r) => a + r.tokensOut, 0),
    // Para el gráfico (solo visual): micro-USD como número entero.
    series: series.map((s) => ({ day: s.day, value: Number(s.micro) })),
  };
}

export type RunFilters = { agentKey?: string; status?: string; limit?: number };

export async function listRuns(ctx: Ctx, f: RunFilters = {}) {
  return getDb()
    .select()
    .from(schema.agentRun)
    .where(
      and(
        eq(schema.agentRun.workspaceId, ctx.workspaceId),
        f.agentKey ? eq(schema.agentRun.agentKey, f.agentKey) : undefined,
        f.status ? eq(schema.agentRun.status, f.status) : undefined,
      ),
    )
    .orderBy(desc(schema.agentRun.startedAt))
    .limit(f.limit ?? 100);
}

export async function getRun(ctx: Ctx, id: string) {
  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.agentRun)
    .where(and(eq(schema.agentRun.id, id), eq(schema.agentRun.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!run) return null;
  const steps = await db
    .select()
    .from(schema.agentStep)
    .where(and(eq(schema.agentStep.runId, id), eq(schema.agentStep.workspaceId, ctx.workspaceId)))
    .orderBy(asc(schema.agentStep.index));
  return { run, steps, def: agentDef(run.agentKey) ?? null };
}

export type RunDetail = NonNullable<Awaited<ReturnType<typeof getRun>>>;
