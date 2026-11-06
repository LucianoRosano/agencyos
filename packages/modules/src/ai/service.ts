import { assertCan, type Ctx, DomainError, forbidden, notFound, todayAR, validation } from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { schema, type Tx } from "@agencyos/db";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { encryptSecret } from "../shared/crypto";
import { assertOwned, type DbOrTx, getDb } from "../shared/db";
import { ENTITIES, type EntityType } from "../shared/entities";
import { AGENTS, agentDef, ENTRY_POINTS, type EntryEntity } from "./agents";
import { MODEL_IDS, microToUsd, usdToMicro } from "./pricing";
import { loadProvider, makeAiClient, type ProviderConfig, providerApiKey } from "./provider";
import { AGENT_TOOLS } from "./tools";

/**
 * Agentes internos con IA (F5, docs/14 §4). La web configura y encola; el worker ejecuta (jobs.ts → runner.ts).
 * Permisos: configurar y pedir ejecuciones gasta dinero → requiere `update settings` (dueño o admin).
 */

const zUsd = (max: number, labelTxt: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim().replace(",", ".") : v),
    z
      .string({ error: `${labelTxt}: ingresá un monto` })
      .regex(/^\d+(\.\d{1,2})?$/, `${labelTxt}: usá un monto en dólares, p. ej. 5 o 2.50`)
      .refine((s) => Number(s) > 0, `${labelTxt}: tiene que ser mayor a cero`)
      .refine((s) => Number(s) <= max, `${labelTxt}: máximo US$ ${max}`),
  );

export const providerInput = z.object({
  apiKey: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
    z
      .string()
      .regex(/^sk-ant-[A-Za-z0-9_-]{20,}$/, "La clave de Anthropic empieza con «sk-ant-» (copiala completa desde console.anthropic.com)")
      .optional(),
  ),
  defaultModel: z.enum(MODEL_IDS as [string, ...string[]], { error: "Elegí un modelo" }),
  monthlyBudgetUsd: zUsd(1000, "El tope mensual"),
});

/** Inicio del mes en curso (Argentina, UTC−3 fijo, sin horario de verano). Se calcula en JS: no depende de la tzdata de PostgreSQL. */
export const monthStartAR = (today = todayAR()) => new Date(`${today.slice(0, 7)}-01T00:00:00-03:00`);

/** Gasto del mes (hora Argentina) en micro-USD, del workspace o de un agente. */
export async function monthSpendMicro(db: DbOrTx, workspaceId: string, agentKey?: string): Promise<bigint> {
  const [r] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.agentRun.costUsd}), 0)::text` })
    .from(schema.agentRun)
    .where(
      and(
        eq(schema.agentRun.workspaceId, workspaceId),
        gte(schema.agentRun.startedAt, monthStartAR()),
        agentKey ? eq(schema.agentRun.agentKey, agentKey) : undefined,
      ),
    );
  return usdToMicro(r?.total ?? "0");
}

/** Crea las filas de los 9 agentes del catálogo que falten (idempotente). */
export async function ensureAgents(t: DbOrTx, ctx: Pick<Ctx, "workspaceId" | "userId">) {
  await t
    .insert(schema.agent)
    .values(
      AGENTS.map((a) => ({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        key: a.key,
        name: a.name,
        enabled: true,
        tools: a.defaultTools,
        permissionLevel: a.permissionLevel,
        maxSteps: a.maxSteps,
        monthlyBudgetUsd: a.monthlyBudgetUsd,
        budgetPerRunUsd: a.budgetPerRunUsd,
      })),
    )
    .onConflictDoNothing();
}

function assertHuman(ctx: Ctx) {
  if (ctx.actor.type !== "user") throw forbidden("Solo una persona puede configurar o pedirle trabajo a los agentes.");
}

/** Guarda la clave (cifrada), el modelo por defecto y el tope mensual. La clave nunca se devuelve. */
export async function saveProvider(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "update", "settings");
  assertHuman(ctx);
  const input = providerInput.parse(raw);
  return getDb().transaction(async (t) => {
    const current = await loadProvider(t, ctx.workspaceId);
    if (!input.apiKey && !current?.hasKey) throw validation("Falta la clave de API", { apiKey: "Pegá tu clave de API de Anthropic" });
    let integrationId = current?.integration?.id ?? null;
    const config: ProviderConfig = { ...(current?.config ?? {}) };
    if (input.apiKey) config.keyLast4 = input.apiKey.slice(-4);
    if (integrationId) {
      await t
        .update(schema.integration)
        .set({
          config,
          ...(input.apiKey ? { secretEnc: encryptSecret(input.apiKey), status: "active", lastError: null, lastOkAt: null } : {}),
        })
        .where(and(eq(schema.integration.id, integrationId), eq(schema.integration.workspaceId, ctx.workspaceId)));
    } else {
      const [integ] = await t
        .insert(schema.integration)
        .values({
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
          provider: "anthropic",
          name: "Anthropic (agentes internos)",
          config,
          secretEnc: input.apiKey ? encryptSecret(input.apiKey) : null,
        })
        .returning({ id: schema.integration.id });
      integrationId = integ?.id ?? null;
    }
    const values = { defaultModel: input.defaultModel, monthlyBudgetUsd: input.monthlyBudgetUsd, enabled: true, integrationId };
    if (current) await t.update(schema.aiProviderConfig).set(values).where(eq(schema.aiProviderConfig.id, current.cfg.id));
    else await t.insert(schema.aiProviderConfig).values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, provider: "anthropic", ...values });
    await ensureAgents(t, ctx);
    await audit(t, ctx, {
      action: "ai.provider.saved",
      targetType: "integration",
      targetId: integrationId,
      after: { model: input.defaultModel, monthlyBudgetUsd: input.monthlyBudgetUsd, keyChanged: Boolean(input.apiKey) },
    });
    await recordEvent(t, ctx, {
      type: "ia.configurada",
      entityType: "integration",
      entityId: integrationId,
      summary: input.apiKey ? "Configuró la clave de Anthropic para los agentes" : "Actualizó la configuración de IA",
    });
    return { configured: true, model: input.defaultModel, monthlyBudgetUsd: input.monthlyBudgetUsd, keyLast4: config.keyLast4 ?? null };
  });
}

/** Quita la clave: la IA queda desactivada y los botones de agentes desaparecen. El historial se conserva. */
export async function removeProviderKey(ctx: Ctx) {
  assertCan(ctx, "update", "settings");
  assertHuman(ctx);
  return getDb().transaction(async (t) => {
    const current = await loadProvider(t, ctx.workspaceId);
    if (!current?.integration) throw notFound("La configuración de IA");
    const { keyLast4: _drop, ...rest } = current.config;
    await t.update(schema.integration).set({ secretEnc: null, config: rest, status: "inactive" }).where(eq(schema.integration.id, current.integration.id));
    await t.update(schema.aiProviderConfig).set({ enabled: false }).where(eq(schema.aiProviderConfig.id, current.cfg.id));
    await t
      .update(schema.agentRun)
      .set({ status: "cancelled", finishedAt: new Date(), errorCode: "sin_clave", errorMessage: "Se quitó la clave de API" })
      .where(and(eq(schema.agentRun.workspaceId, ctx.workspaceId), eq(schema.agentRun.status, "queued")));
    await audit(t, ctx, { action: "ai.provider.key_removed", targetType: "integration", targetId: current.integration.id });
    await recordEvent(t, ctx, { type: "ia.desactivada", entityType: "integration", entityId: current.integration.id, summary: "Quitó la clave de Anthropic" });
    return { configured: false };
  });
}

/** Prueba de conexión con una llamada mínima (consulta del modelo, sin consumir tokens). */
export async function testProvider(ctx: Ctx) {
  assertCan(ctx, "update", "settings");
  assertHuman(ctx);
  const db = getDb();
  const p = await loadProvider(db, ctx.workspaceId);
  const key = await providerApiKey(ctx.workspaceId, db);
  if (!p?.integration || !key) throw validation("Primero guardá la clave de API.");
  let ok = true;
  let message = `Conexión correcta con ${p.model}.`;
  try {
    await makeAiClient(key).checkModel(p.model);
  } catch (e) {
    ok = false;
    const status = (e as { status?: number }).status;
    message =
      status === 401 || status === 403
        ? "Anthropic rechazó la clave (401/403). Revisá que esté activa."
        : status === 404
          ? `La clave no tiene acceso al modelo ${p.model}.`
          : "No se pudo conectar con Anthropic. Probá de nuevo en un rato.";
  }
  await db
    .update(schema.integration)
    .set(ok ? { lastOkAt: new Date(), lastError: null, status: "active" } : { lastError: message, status: "error" })
    .where(eq(schema.integration.id, p.integration.id));
  await audit(db, ctx, { action: ok ? "ai.provider.test_ok" : "ai.provider.test_failed", targetType: "integration", targetId: p.integration.id });
  if (!ok) throw new DomainError("EXTERNAL", message);
  return { ok, message };
}

async function agentRow(db: DbOrTx, ctx: Ctx, key: string) {
  const [row] = await db
    .select()
    .from(schema.agent)
    .where(and(eq(schema.agent.workspaceId, ctx.workspaceId), eq(schema.agent.key, key)))
    .limit(1);
  return row ?? null;
}

export const agentInput = z.object({
  modelId: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.enum(MODEL_IDS as [string, ...string[]]).optional()),
  monthlyBudgetUsd: zUsd(500, "El tope mensual del agente"),
  budgetPerRunUsd: zUsd(50, "El tope por ejecución"),
  maxSteps: z.coerce.number().int().min(1, "Mínimo 1 paso").max(30, "Máximo 30 pasos"),
  tools: z.array(z.string()).default([]),
  prompt: z.preprocess((v) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : v), z.string().max(8000, "Máximo 8000 caracteres")),
});

/** Edita un agente: modelo, topes, pasos, herramientas (dentro de las permitidas) y prompt. */
export async function updateAgent(ctx: Ctx, key: string, raw: unknown) {
  assertCan(ctx, "update", "settings");
  assertHuman(ctx);
  const def = agentDef(key);
  if (!def) throw notFound("El agente");
  const input = agentInput.parse(raw);
  const outside = input.tools.filter((t) => !def.allowedTools.includes(t));
  if (outside.length)
    throw validation(`Herramientas no permitidas para ${def.name}: ${outside.join(", ")}`, { tools: "Herramienta fuera del alcance del agente" });
  const tools = def.allowedTools.filter((t) => input.tools.includes(t) && (def.permissionLevel !== "read" || AGENT_TOOLS[t]?.kind === "read"));
  if (!tools.length) throw validation("Elegí al menos una herramienta", { tools: "Elegí al menos una herramienta" });
  return getDb().transaction(async (t) => {
    await ensureAgents(t, ctx);
    const row = await agentRow(t, ctx, key);
    if (!row) throw notFound("El agente");
    const p = await loadProvider(t, ctx.workspaceId);
    if (!p?.integration) throw validation("Configurá la IA primero.");
    const prompts = { ...(p.config.agentPrompts ?? {}) };
    const before = prompts[key] ?? def.prompt;
    const next = input.prompt && input.prompt !== def.prompt ? input.prompt : null;
    if (next) prompts[key] = next;
    else delete prompts[key];
    const promptChanged = (next ?? def.prompt) !== before;
    await t
      .update(schema.integration)
      .set({ config: { ...p.config, agentPrompts: prompts } })
      .where(eq(schema.integration.id, p.integration.id));
    const [updated] = await t
      .update(schema.agent)
      .set({
        modelId: input.modelId ?? null,
        monthlyBudgetUsd: input.monthlyBudgetUsd,
        budgetPerRunUsd: input.budgetPerRunUsd,
        maxSteps: input.maxSteps,
        tools,
        systemPromptVersion: promptChanged ? String(Number(row.systemPromptVersion) + 1 || 2) : row.systemPromptVersion,
      })
      .where(eq(schema.agent.id, row.id))
      .returning();
    await audit(t, ctx, {
      action: "ai.agent.updated",
      targetType: "agent",
      targetId: row.id,
      before: { tools: row.tools, modelId: row.modelId, monthlyBudgetUsd: row.monthlyBudgetUsd, promptVersion: row.systemPromptVersion },
      after: { tools, modelId: input.modelId ?? null, monthlyBudgetUsd: input.monthlyBudgetUsd, promptVersion: updated?.systemPromptVersion },
    });
    await recordEvent(t, ctx, { type: "agente.actualizado", entityType: "agent", entityId: row.id, summary: `Actualizó el agente ${def.name}` });
    return updated;
  });
}

export async function setAgentEnabled(ctx: Ctx, key: string, enabled: boolean) {
  assertCan(ctx, "update", "settings");
  assertHuman(ctx);
  const def = agentDef(key);
  if (!def) throw notFound("El agente");
  return getDb().transaction(async (t) => {
    await ensureAgents(t, ctx);
    const [row] = await t
      .update(schema.agent)
      .set({ enabled })
      .where(and(eq(schema.agent.workspaceId, ctx.workspaceId), eq(schema.agent.key, key)))
      .returning();
    if (!row) throw notFound("El agente");
    await recordEvent(t, ctx, {
      type: enabled ? "agente.activado" : "agente.desactivado",
      entityType: "agent",
      entityId: row.id,
      summary: `${enabled ? "Activó" : "Desactivó"} el agente ${def.name}`,
    });
    return row;
  });
}

export const runInput = z.object({
  agentKey: z.string().min(1, "Elegí un agente"),
  request: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string({ error: "Escribí el pedido" }).min(3, "Escribí el pedido").max(4000, "Máximo 4000 caracteres"),
  ),
  entityType: z.preprocess((v) => (v === "" ? undefined : v), z.enum(Object.keys(ENTRY_POINTS) as [EntryEntity, ...EntryEntity[]]).optional()),
  entityId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid("Identificador inválido").optional()),
});

/** Contexto de máquina con el que actúa un agente (docs/14 §1): sus alcances salen de sus herramientas. */
export function agentActor(base: Pick<Ctx, "workspaceId" | "userId" | "role">, agent: { key: string; name: string }, scopes: string[]): Ctx {
  return { workspaceId: base.workspaceId, userId: base.userId, role: base.role, actor: { type: "agent", id: `agent:${agent.key}`, name: agent.name }, scopes };
}

/** Marca un pedido como frenado por tope y avisa (evento del agente → notificación vía outbox). */
async function markBudgetExceeded(t: Tx, ctx: Ctx, runId: string, agent: { key: string; name: string }, reason: string) {
  await t
    .update(schema.agentRun)
    .set({ status: "budget_exceeded", finishedAt: new Date(), errorCode: "budget_exceeded", errorMessage: reason })
    .where(eq(schema.agentRun.id, runId));
  await recordEvent(t, agentActor(ctx, agent, []), {
    type: "agente.presupuesto_excedido",
    entityType: "agent_run",
    entityId: runId,
    summary: `${agent.name} no arrancó: ${reason}`,
  });
}

/** Verifica topes mensuales (workspace y agente). Devuelve el motivo si se superó. */
export async function budgetBlock(db: DbOrTx, workspaceId: string, agent: { key: string; monthlyBudgetUsd: string }, wsBudgetUsd: string, extraMicro = 0n) {
  const ws = (await monthSpendMicro(db, workspaceId)) + extraMicro;
  if (ws >= usdToMicro(wsBudgetUsd)) return `se alcanzó el tope mensual de IA (US$ ${wsBudgetUsd}).`;
  const ag = (await monthSpendMicro(db, workspaceId, agent.key)) + extraMicro;
  if (ag >= usdToMicro(agent.monthlyBudgetUsd)) return `se alcanzó el tope mensual del agente (US$ ${agent.monthlyBudgetUsd}).`;
  return null;
}

/** Encola un pedido a un agente. El worker lo ejecuta (jobs.ts). Si el tope está agotado, no arranca y se avisa. */
export async function startRun(ctx: Ctx, raw: unknown, trigger: "manual" | "automation" | "schedule" = "manual") {
  assertCan(ctx, "update", "settings");
  assertHuman(ctx);
  const input = runInput.parse(raw);
  const def = agentDef(input.agentKey);
  if (!def) throw validation("Ese agente no existe", { agentKey: "Elegí un agente" });
  if (Boolean(input.entityType) !== Boolean(input.entityId)) throw validation("Falta el elemento de contexto");
  const db = getDb();
  const p = await loadProvider(db, ctx.workspaceId);
  if (!p?.cfg.enabled || !p.hasKey) throw validation("La IA no está configurada: cargá la clave en IA → Configuración.");

  let entityTitle: string | null = null;
  if (input.entityType && input.entityId) {
    const entity = ENTITIES[input.entityType as EntityType];
    await assertOwned(db, ctx, entity.table, input.entityId, "El elemento");
    // biome-ignore lint/suspicious/noExplicitAny: título genérico del registro de entidades
    const tbl = entity.table as any;
    const [row] = await db.select({ title: tbl[entity.title] }).from(tbl).where(eq(tbl.id, input.entityId)).limit(1);
    entityTitle = row ? String(row.title ?? "").slice(0, 160) : null;
  }

  const result = await db.transaction(async (t) => {
    await ensureAgents(t, ctx);
    const agent = await agentRow(t, ctx, def.key);
    if (!agent) throw notFound("El agente");
    if (!agent.enabled) throw validation(`${def.name} está desactivado. Activalo en IA → Agentes.`);
    const [run] = await t
      .insert(schema.agentRun)
      .values({
        workspaceId: ctx.workspaceId,
        agentId: agent.id,
        agentKey: def.key,
        trigger,
        status: "queued",
        input: { request: input.request, entityType: input.entityType ?? null, entityId: input.entityId ?? null, entityTitle },
        createdBy: ctx.userId,
      })
      .returning();
    if (!run) throw new Error("No se pudo crear la ejecución");
    const blocked = await budgetBlock(t, ctx.workspaceId, agent, p.cfg.monthlyBudgetUsd);
    if (blocked) {
      await markBudgetExceeded(t, ctx, run.id, { key: def.key, name: def.name }, blocked);
      return { run, blocked };
    }
    await recordEvent(t, ctx, {
      type: "agente.encargado",
      entityType: input.entityType ?? "agent_run",
      entityId: input.entityId ?? run.id,
      summary: `Le pidió a ${def.name}: ${input.request.slice(0, 80)}`,
      payload: { runId: run.id, agentKey: def.key },
    });
    return { run, blocked: null };
  });
  if (result.blocked) throw validation(`No se ejecutó: ${result.blocked} Subí el tope en IA → Configuración o esperá al mes que viene.`);
  return result.run;
}

/** Pedido desde una ficha (proyecto, sitio o nota): agente y pedido fijos. */
export async function startEntityRun(ctx: Ctx, entityType: EntryEntity, entityId: string) {
  const ep = ENTRY_POINTS[entityType];
  if (!ep) throw validation("No hay un agente para este tipo de elemento");
  return startRun(ctx, { agentKey: ep.agentKey, request: ep.request, entityType, entityId });
}

export async function cancelRun(ctx: Ctx, id: string) {
  assertCan(ctx, "update", "settings");
  assertHuman(ctx);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.agentRun)
      .set({ status: "cancelled", finishedAt: new Date(), errorCode: "cancelled", errorMessage: "Cancelada por la persona" })
      .where(and(eq(schema.agentRun.id, id), eq(schema.agentRun.workspaceId, ctx.workspaceId), inArray(schema.agentRun.status, ["queued", "running"])))
      .returning();
    if (!row) throw validation("Esa ejecución ya terminó o no existe.");
    await recordEvent(t, ctx, { type: "agente.cancelado", entityType: "agent_run", entityId: id, summary: "Canceló una ejecución de agente" });
    return row;
  });
}

export { microToUsd };
