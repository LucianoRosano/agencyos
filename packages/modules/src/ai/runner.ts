import type { Ctx, Role } from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import type Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { and, eq } from "drizzle-orm";
import { addComment } from "../collab/service";
import { buildMcpServer } from "../mcp/server";
import { getNote } from "../notes/queries";
import { getDb } from "../shared/db";
import { getBlueprint, getBrief, getSite, listRequirements } from "../sites/queries";
import { agentDef, COMMON_RULES } from "./agents";
import { costMicroUsd, microToUsd, usdToMicro } from "./pricing";
import { loadProvider, makeAiClient, providerApiKey } from "./provider";
import { agentActor, budgetBlock } from "./service";
import { AGENT_TOOLS, scopesForTools } from "./tools";

/**
 * Loop de tool use (docs/14 §4): el modelo pide herramientas, el runner las ejecuta con el MISMO servidor
 * MCP (cliente en memoria) y el Ctx del agente, y registra cada paso en agent_step.
 * Cortes: máximo de pasos, timeout total, tope por ejecución y mensual, 2 errores seguidos de la misma
 * herramienta, cancelación desde la UI.
 */

const MAX_TOKENS = 8000;
const MAX_CONTEXT_CHARS = 30_000;
const MAX_TOOL_RESULT_CHARS = 20_000;
const COMMENT_LIMIT = 9_500;

type RunRow = typeof schema.agentRun.$inferSelect;
type RunInput = { request?: string; entityType?: string | null; entityId?: string | null; entityTitle?: string | null };

class StopRun extends Error {
  constructor(
    public status: "failed" | "cancelled" | "budget_exceeded",
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}… [recortado, ${s.length} caracteres]` : s);

/** Redacta la entrada de una herramienta para la traza: strings largos recortados. */
function redact(v: unknown, depth = 0): unknown {
  if (typeof v === "string") return clip(v, 500);
  if (Array.isArray(v)) return depth > 3 ? "[…]" : v.slice(0, 50).map((x) => redact(x, depth + 1));
  if (v && typeof v === "object") return depth > 3 ? "{…}" : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x, depth + 1)]));
  return v;
}

function isRetryable(e: unknown) {
  const status = (e as { status?: number }).status;
  if (status === undefined) return (e as { name?: string }).name !== "AbortError";
  return status === 429 || status === 529 || status >= 500;
}

/** Contexto de la entidad desde la que se pidió el trabajo (datos frescos, del workspace, como datos no confiables). */
async function entityContext(ctx: Ctx, input: RunInput): Promise<string> {
  if (!input.entityType || !input.entityId) return "";
  const wrap = (title: string, body: unknown) =>
    `\n\n<datos_no_confiables origen="${title}">\n${clip(typeof body === "string" ? body : JSON.stringify(body, null, 1), MAX_CONTEXT_CHARS)}\n</datos_no_confiables>`;
  if (input.entityType === "project") return `\n\nProyecto: «${input.entityTitle ?? ""}» (id ${input.entityId}). Leelo con ver_proyecto antes de responder.`;
  if (input.entityType === "site") {
    const site = await getSite(ctx, input.entityId);
    if (!site) throw new StopRun("failed", "entity_missing", "El sitio ya no existe.");
    const [brief, bp, reqs] = await Promise.all([getBrief(ctx, input.entityId), getBlueprint(ctx, input.entityId), listRequirements(ctx, input.entityId)]);
    return `\n\nSitio «${input.entityTitle ?? ""}» (id ${input.entityId}).${wrap("sitio", {
      sitio: site,
      briefing: brief ? { respuestas: brief.answers, preguntas_para_el_cliente: brief.questionsForClient } : null,
      requerimientos: reqs.map((r) => ({ titulo: r.title, moscow: r.moscow, estado: r.status, aceptacion: r.acceptanceMd })),
      blueprint_actual: bp.current ? { version: bp.current.version, arbol: bp.current.tree } : null,
    })}`;
  }
  if (input.entityType === "note") {
    const n = await getNote(ctx, input.entityId);
    if (!n) throw new StopRun("failed", "entity_missing", "La nota ya no existe.");
    const proj = n.entity?.type === "project" ? `\nLa nota pertenece al proyecto «${n.entity.title}» (id ${n.entity.id}).` : "";
    return `\n\nNota «${n.n.title}» (id ${n.n.id}).${proj}${wrap("nota", n.n.bodyMd ?? "")}`;
  }
  return "";
}

/** Ejecuta una corrida ya reclamada por el worker (status = running). Nunca lanza: deja el resultado en la fila. */
export async function executeRun(runId: string): Promise<RunRow["status"]> {
  const db = getDb();
  const [run] = await db.select().from(schema.agentRun).where(eq(schema.agentRun.id, runId)).limit(1);
  if (!run) return "failed";
  const def = agentDef(run.agentKey);
  const startedMs = Date.now();
  let stepIndex = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let costMicro = 0n;
  let modelUsed: string | null = null;
  const outputEntities: { type: string; id: string; tool?: string }[] = [];
  let agentCtx: Ctx | null = null;
  let mcp: Client | null = null;

  const step = async (s: {
    kind: "model" | "tool" | "approval";
    toolName?: string;
    input?: unknown;
    output?: unknown;
    latencyMs?: number;
    tokens?: number;
    error?: string;
  }) => {
    await db.insert(schema.agentStep).values({
      workspaceId: run.workspaceId,
      runId: run.id,
      index: stepIndex++,
      kind: s.kind,
      toolName: s.toolName ?? null,
      input: (s.input ?? null) as object | null,
      output: (s.output ?? null) as object | null,
      latencyMs: s.latencyMs ?? null,
      tokens: s.tokens ?? null,
      error: s.error ?? null,
    });
  };
  const progress = () =>
    db
      .update(schema.agentRun)
      .set({ tokensIn, tokensOut, costUsd: microToUsd(costMicro), modelUsed })
      .where(eq(schema.agentRun.id, run.id));

  try {
    if (!def) throw new StopRun("failed", "agent_unknown", "El agente ya no existe en el catálogo.");
    const [agent] = await db
      .select()
      .from(schema.agent)
      .where(and(eq(schema.agent.workspaceId, run.workspaceId), eq(schema.agent.key, run.agentKey)))
      .limit(1);
    if (!agent?.enabled) throw new StopRun("cancelled", "agent_disabled", "El agente está desactivado.");
    const provider = await loadProvider(db, run.workspaceId);
    const apiKey = await providerApiKey(run.workspaceId, db);
    if (!provider?.cfg.enabled || !apiKey) throw new StopRun("cancelled", "sin_clave", "La IA no está configurada.");

    // El agente actúa en nombre de quien lo pidió (nunca con más permisos que esa persona) y con sus alcances.
    const [m] = run.createdBy
      ? await db
          .select({ role: schema.membership.role })
          .from(schema.membership)
          .where(and(eq(schema.membership.workspaceId, run.workspaceId), eq(schema.membership.userId, run.createdBy), eq(schema.membership.status, "active")))
          .limit(1)
      : [];
    if (!m) throw new StopRun("failed", "sin_usuario", "Quien pidió la ejecución ya no tiene acceso al espacio de trabajo.");
    const enabledTools = agent.tools.filter((t) => def.allowedTools.includes(t) && AGENT_TOOLS[t]);
    agentCtx = agentActor({ workspaceId: run.workspaceId, userId: run.createdBy, role: m.role as Role }, agent, scopesForTools(enabledTools));

    const blocked = await budgetBlock(db, run.workspaceId, agent, provider.cfg.monthlyBudgetUsd);
    if (blocked) throw new StopRun("budget_exceeded", "budget_exceeded", blocked);

    const input = run.input as RunInput;
    const system = `${COMMON_RULES}\n\n${provider.config.agentPrompts?.[def.key] ?? def.prompt}\n\nHoy es ${new Date().toLocaleDateString("es-AR", { timeZone: "America/Buenos_Aires" })}. Tenés como máximo ${agent.maxSteps} pasos.`;
    const userText = `Pedido de Luciano: ${input.request ?? ""}${await entityContext(agentCtx, input)}`;

    // Herramientas: las del servidor MCP, filtradas por las habilitadas para el agente.
    const server = buildMcpServer(agentCtx);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    mcp = new Client({ name: `agencyos-agent-${def.key}`, version: "1.0.0" });
    await mcp.connect(b);
    const listed = await mcp.listTools();
    const tools: Anthropic.Tool[] = listed.tools
      .filter((t) => enabledTools.includes(t.name))
      .map((t) => {
        const { $schema: _s, ...schemaRest } = t.inputSchema as Record<string, unknown>;
        return { name: t.name, description: t.description ?? t.title ?? t.name, input_schema: { ...schemaRest, type: "object" } as Anthropic.Tool.InputSchema };
      });

    const client = makeAiClient(apiKey);
    let model = agent.modelId ?? provider.model;
    let usedFallback = false;
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];
    const deadline = startedMs + agent.timeoutS * 1000;
    const perRun = usdToMicro(agent.budgetPerRunUsd);
    const lastErrors = new Map<string, number>();
    let finalText = "";
    let finished = false;

    for (let turn = 0; turn < agent.maxSteps; turn++) {
      const [cur] = await db.select({ status: schema.agentRun.status }).from(schema.agentRun).where(eq(schema.agentRun.id, run.id));
      if (cur?.status === "cancelled") throw new StopRun("cancelled", "cancelled", "Cancelada por la persona.");
      if (Date.now() >= deadline) throw new StopRun("failed", "timeout", `Se superó el tiempo máximo (${agent.timeoutS} s).`);
      if (costMicro >= perRun) throw new StopRun("budget_exceeded", "budget_exceeded", `se alcanzó el tope por ejecución (US$ ${agent.budgetPerRunUsd}).`);
      const monthly = await budgetBlock(db, run.workspaceId, agent, provider.cfg.monthlyBudgetUsd, 0n);
      if (monthly) throw new StopRun("budget_exceeded", "budget_exceeded", monthly);

      const t0 = Date.now();
      let res: Anthropic.Message;
      try {
        res = await client.createMessage(
          { model, max_tokens: MAX_TOKENS, system, tools, messages, output_config: { effort: "medium" } },
          { timeoutMs: Math.max(5_000, deadline - Date.now()) },
        );
      } catch (e) {
        const status = (e as { status?: number }).status;
        await step({ kind: "model", input: { model }, latencyMs: Date.now() - t0, error: `Error del proveedor${status ? ` (${status})` : ""}` });
        if (isRetryable(e) && agent.fallbackModel && !usedFallback) {
          usedFallback = true;
          model = agent.fallbackModel;
          turn--;
          continue;
        }
        throw new StopRun("failed", status === 401 ? "auth" : "provider_error", status === 401 ? "Anthropic rechazó la clave." : "El proveedor de IA falló.");
      }
      modelUsed = res.model ?? model;
      tokensIn += res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0);
      tokensOut += res.usage.output_tokens;
      costMicro += costMicroUsd(model, res.usage);
      await progress();
      const text = res.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n\n");
      const uses = res.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
      await step({
        kind: "model",
        input: { model, mensajes: messages.length },
        output: { stop_reason: res.stop_reason, texto: clip(text, 4000), herramientas: uses.map((u) => u.name) },
        latencyMs: Date.now() - t0,
        tokens: res.usage.input_tokens + res.usage.output_tokens,
      });
      if (res.stop_reason === "refusal") throw new StopRun("failed", "refusal", "El modelo se negó a completar el pedido.");
      if (!uses.length) {
        finalText = text;
        finished = true;
        break;
      }
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) {
        const t1 = Date.now();
        let out = "";
        let isError = false;
        if (!enabledTools.includes(u.name)) {
          isError = true;
          out = `La herramienta ${u.name} no está habilitada para ${def.name}. Si hace falta, usá proponer_cambio.`;
          await audit(db, agentCtx, { action: "ai.tool_denied", targetType: "tool", targetId: u.name, after: { runId: run.id } });
        } else {
          try {
            const r = (await mcp.callTool({ name: u.name, arguments: (u.input ?? {}) as Record<string, unknown> })) as {
              content?: { type: string; text?: string }[];
              isError?: boolean;
            };
            out = (r.content ?? []).map((c) => c.text ?? "").join("\n");
            isError = Boolean(r.isError);
          } catch (e) {
            isError = true;
            out = e instanceof Error ? e.message : "Error al ejecutar la herramienta.";
          }
        }
        if (!isError) {
          try {
            const parsed = JSON.parse(out) as { id?: string };
            const kind = {
              crear_tarea: "task",
              proponer_cambio: "approval",
              crear_nota_proyecto: "note",
              capturar: "inbox_item",
              registrar_decision: "decision",
            }[u.name];
            if (kind && parsed?.id) outputEntities.push({ type: kind, id: parsed.id, tool: u.name });
          } catch {
            /* salida no JSON */
          }
        }
        await step({
          kind: u.name === "proponer_cambio" && !isError ? "approval" : "tool",
          toolName: u.name,
          input: redact(u.input),
          output: { resultado: clip(out, 2000) },
          latencyMs: Date.now() - t1,
          error: isError ? clip(out, 500) : undefined,
        });
        const errs = isError ? (lastErrors.get(u.name) ?? 0) + 1 : 0;
        lastErrors.set(u.name, errs);
        results.push({
          type: "tool_result",
          tool_use_id: u.id,
          content: clip(out || "(sin resultado)", MAX_TOOL_RESULT_CHARS),
          is_error: isError || undefined,
        });
        if (errs >= 2) throw new StopRun("failed", "tool_errors", `La herramienta ${u.name} falló dos veces seguidas.`);
      }
      messages.push({ role: "user", content: results });
    }
    if (!finished) throw new StopRun("failed", "max_steps", `Se alcanzó el máximo de ${agent.maxSteps} pasos sin una respuesta final.`);

    // Entrega: comentario interno en la ficha (evento del agente → notificación) o evento de finalización.
    const outputMd = finalText.trim() || "(El agente no devolvió texto.)";
    const deliverCtx: Ctx = { ...agentCtx, scopes: [...(agentCtx.scopes ?? []), "write:comments"] };
    if (input.entityType && input.entityId) {
      const body = `**${def.name}** · ${input.request ?? ""}\n\n${outputMd.length > COMMENT_LIMIT ? `${outputMd.slice(0, COMMENT_LIMIT)}\n\n… (resultado completo en /ia/ejecuciones/${run.id})` : outputMd}`;
      const c = await addComment(deliverCtx, input.entityType, input.entityId, body);
      if (c) outputEntities.push({ type: "comment", id: c.id });
    }
    await db.transaction(async (t) => {
      await t
        .update(schema.agentRun)
        .set({ status: "succeeded", outputMd, outputEntities, finishedAt: new Date(), tokensIn, tokensOut, costUsd: microToUsd(costMicro), modelUsed })
        .where(eq(schema.agentRun.id, run.id));
      if (!input.entityType)
        await recordEvent(t, agentCtx as Ctx, {
          type: "agente.completado",
          entityType: "agent_run",
          entityId: run.id,
          summary: `${def.name} terminó: ${clip(input.request ?? "", 80)}`,
        });
    });
    return "succeeded";
  } catch (e) {
    const stop = e instanceof StopRun ? e : new StopRun("failed", "internal", "Error interno del agente.");
    if (!(e instanceof StopRun)) console.error("[ai] run", run.id, e);
    const name = def?.name ?? run.agentKey;
    await db.transaction(async (t) => {
      const [cur] = await t.select({ status: schema.agentRun.status }).from(schema.agentRun).where(eq(schema.agentRun.id, run.id));
      await t
        .update(schema.agentRun)
        .set({
          status: cur?.status === "cancelled" ? "cancelled" : stop.status,
          errorCode: stop.code,
          errorMessage: stop.message,
          finishedAt: new Date(),
          tokensIn,
          tokensOut,
          costUsd: microToUsd(costMicro),
          modelUsed,
          outputEntities,
        })
        .where(eq(schema.agentRun.id, run.id));
      if (stop.status !== "cancelled" && cur?.status !== "cancelled") {
        const actor = agentCtx ?? agentActor({ workspaceId: run.workspaceId, userId: run.createdBy, role: "owner" }, { key: run.agentKey, name }, []);
        await recordEvent(t, actor, {
          type: stop.status === "budget_exceeded" ? "agente.presupuesto_excedido" : "agente.fallo",
          entityType: "agent_run",
          entityId: run.id,
          summary: stop.status === "budget_exceeded" ? `${name} se detuvo: ${stop.message}` : `${name} falló: ${stop.message}`,
        });
      }
    });
    return stop.status;
  } finally {
    await mcp?.close().catch(() => undefined);
  }
}
