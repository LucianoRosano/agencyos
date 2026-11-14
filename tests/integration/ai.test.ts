import { getDb, schema } from "@agencyos/db";
import { processAgentRuns } from "@agencyos/modules/ai/jobs";
import { type AiClient, setAiClientFactory } from "@agencyos/modules/ai/provider";
import { availableAgents, getRun, listRuns, providerState } from "@agencyos/modules/ai/queries";
import { cancelRun, saveProvider, setAgentEnabled, startEntityRun, startRun, testProvider, updateAgent } from "@agencyos/modules/ai/service";
import { listComments } from "@agencyos/modules/collab/service";
import { createNote } from "@agencyos/modules/notes/service";
import { createProject } from "@agencyos/modules/projects/service";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

/**
 * Evals mínimas de los agentes internos con el cliente de Anthropic SIMULADO (nunca la API real).
 * Cada escenario guioniza las respuestas del modelo y verifica lo que hace el runner.
 */
const KEY = "sk-ant-api03-test_0123456789abcdefghij-XYZ9";

type Params = Parameters<AiClient["createMessage"]>[0];
type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type Turn = { content: Block[]; usage?: { input_tokens: number; output_tokens: number } };

function mockClient(turns: (Turn | ((p: Params) => Turn))[], calls: Params[] = []) {
  let i = 0;
  setAiClientFactory((key) => {
    expect(key).toBe(KEY); // el runner usa la clave descifrada
    return {
      checkModel: async () => undefined,
      createMessage: async (p) => {
        calls.push(JSON.parse(JSON.stringify(p)));
        const t = turns[Math.min(i++, turns.length - 1)];
        const turn = typeof t === "function" ? t(p) : (t as Turn);
        const usesTool = turn.content.some((c) => c.type === "tool_use");
        return {
          id: `msg_${i}`,
          type: "message",
          role: "assistant",
          model: p.model,
          content: turn.content,
          stop_reason: usesTool ? "tool_use" : "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...turn.usage },
        } as unknown as Awaited<ReturnType<AiClient["createMessage"]>>;
      },
    };
  });
  return calls;
}

const use = (name: string, input: Record<string, unknown> = {}, id = `tu_${name}_${Math.random().toString(36).slice(2, 8)}`): Turn => ({
  content: [{ type: "tool_use", id, name, input }],
});
const say = (text: string): Turn => ({ content: [{ type: "text", text }] });

async function setup(budget = "10") {
  const ctx = await makeWorkspace();
  await saveProvider(ctx, { apiKey: KEY, defaultModel: "claude-sonnet-5-5", monthlyBudgetUsd: budget });
  return ctx;
}

afterEach(() => setAiClientFactory(null));

describe("IA · proveedor", () => {
  it("la clave se guarda cifrada y nunca se expone (solo los últimos 4)", async () => {
    const ctx = await makeWorkspace();
    const saved = await saveProvider(ctx, { apiKey: KEY, defaultModel: "claude-sonnet-5-5", monthlyBudgetUsd: "5" });
    expect(JSON.stringify(saved)).not.toContain(KEY);
    const [integ] = await getDb()
      .select()
      .from(schema.integration)
      .where(and(eq(schema.integration.workspaceId, ctx.workspaceId), eq(schema.integration.provider, "anthropic")));
    expect(integ?.secretEnc).toBeTruthy();
    expect(Buffer.from(integ?.secretEnc as Buffer).toString("utf8")).not.toContain("sk-ant");
    expect(JSON.stringify(integ?.config)).not.toContain(KEY);
    const state = await providerState(ctx);
    expect(state.configured).toBe(true);
    expect(state.keyLast4).toBe("XYZ9");
    expect(JSON.stringify(state)).not.toContain(KEY);
    const audits = await getDb().select().from(schema.auditLog).where(eq(schema.auditLog.workspaceId, ctx.workspaceId));
    expect(JSON.stringify(audits)).not.toContain(KEY);
    // Guardar sin clave conserva la anterior
    await saveProvider(ctx, { apiKey: "", defaultModel: "claude-haiku-5-5", monthlyBudgetUsd: "3" });
    expect((await providerState(ctx)).keyLast4).toBe("XYZ9");
  });

  it("valida la clave, el tope y los permisos", async () => {
    const ctx = await makeWorkspace();
    await expect(saveProvider(ctx, { apiKey: "hola", defaultModel: "claude-sonnet-5-5", monthlyBudgetUsd: "5" })).rejects.toThrow();
    await expect(saveProvider(ctx, { apiKey: KEY, defaultModel: "claude-sonnet-5-5", monthlyBudgetUsd: "0" })).rejects.toThrow();
    await expect(saveProvider(ctx, { apiKey: "", defaultModel: "claude-sonnet-5-5", monthlyBudgetUsd: "5" })).rejects.toThrow(/clave/);
    await expect(saveProvider({ ...ctx, role: "member" }, { apiKey: KEY, defaultModel: "claude-sonnet-5-5", monthlyBudgetUsd: "5" })).rejects.toThrow();
    const bot = { ...ctx, actor: { type: "agent" as const, id: "x", name: "Bot" }, scopes: ["read:all", "propose:*"] };
    await expect(saveProvider(bot, { apiKey: KEY, defaultModel: "claude-sonnet-5-5", monthlyBudgetUsd: "5" })).rejects.toThrow();
  });

  it("sin clave no hay agentes disponibles; probar conexión usa el cliente (mock)", async () => {
    const ctx = await makeWorkspace();
    expect((await availableAgents(ctx)).size).toBe(0);
    await expect(startRun(ctx, { agentKey: "pm", request: "Hola" })).rejects.toThrow(/no está configurada/);
    await saveProvider(ctx, { apiKey: KEY, defaultModel: "claude-sonnet-5-5", monthlyBudgetUsd: "5" });
    expect((await availableAgents(ctx)).has("pm")).toBe(true);
    expect((await availableAgents({ ...ctx, role: "member" })).size).toBe(0);
    setAiClientFactory(() => ({ createMessage: async () => Promise.reject(new Error("no")), checkModel: async () => undefined }));
    expect((await testProvider(ctx)).ok).toBe(true);
    setAiClientFactory(() => ({ createMessage: async () => Promise.reject(new Error("no")), checkModel: async () => Promise.reject({ status: 401 }) }));
    await expect(testProvider(ctx)).rejects.toThrow(/rechazó la clave/);
  });
});

describe("IA · ejecuciones (evals con modelo simulado)", () => {
  it("PM en un proyecto: usa ver_proyecto, registra la traza, el costo y deja un comentario del agente", async () => {
    const ctx = await setup();
    const p = await createProject(ctx, { name: "Tienda Uno", status: "in_progress", nextAction: "Llamar al cliente" });
    const calls = mockClient([(_) => use("ver_proyecto", { id: p.id }), say("## Plan\n- Llamar al cliente\n\n### Próximos pasos\n- Definir catálogo")]);
    const run = await startEntityRun(ctx, "project", p.id);
    expect(run.status).toBe("queued");
    const r = await processAgentRuns();
    expect(r.processed).toBe(1);

    const d = await getRun(ctx, run.id);
    expect(d?.run.status).toBe("succeeded");
    expect(d?.run.outputMd).toContain("## Plan");
    expect(d?.run.tokensIn).toBe(2000);
    expect(d?.run.tokensOut).toBe(400);
    // Sonnet 5.5: 2000 × $2/M + 400 × $10/M = 0.004 + 0.004
    expect(d?.run.costUsd).toBe("0.008000");
    expect(d?.run.modelUsed).toBe("claude-sonnet-5-5");
    expect(d?.steps.map((s) => `${s.kind}:${s.toolName ?? ""}`)).toEqual(["model:", "tool:ver_proyecto", "model:"]);
    expect(JSON.stringify(d?.steps[1]?.output)).toContain("Tienda Uno");

    // El modelo recibió solo las herramientas habilitadas del PM (sin finanzas ni eliminar)
    const toolNames = (calls[0]?.tools ?? []).map((t) => (t as { name: string }).name);
    expect(toolNames).toContain("ver_proyecto");
    expect(toolNames).not.toContain("ver_finanzas_resumen");
    expect(toolNames).not.toContain("eliminar_elemento");
    expect(String(calls[0]?.system)).toContain("rioplatense");

    const comments = await listComments(ctx, "project", p.id);
    expect(comments[0]?.c.bodyMd).toContain("Project Manager");
    const [ev] = await getDb()
      .select()
      .from(schema.domainEvent)
      .where(and(eq(schema.domainEvent.workspaceId, ctx.workspaceId), eq(schema.domainEvent.type, "comentario.creado")));
    expect(ev?.actorType).toBe("agent"); // → el outbox lo notifica
    expect(ev?.actorId).toBe("agent:pm");
  });

  it("scopes: un agente sin la herramienta de finanzas no puede usarla (y corta tras 2 errores)", async () => {
    const ctx = await setup();
    mockClient([use("ver_finanzas_resumen"), use("ver_finanzas_resumen"), say("no debería llegar")]);
    const run = await startRun(ctx, { agentKey: "pm", request: "¿Cuánto facturé?" });
    await processAgentRuns();
    const d = await getRun(ctx, run.id);
    expect(d?.run.status).toBe("failed");
    expect(d?.run.errorCode).toBe("tool_errors");
    const toolSteps = d?.steps.filter((s) => s.kind === "tool") ?? [];
    expect(toolSteps).toHaveLength(2);
    expect(toolSteps[0]?.error).toMatch(/no está habilitada/);
    expect(JSON.stringify(toolSteps)).not.toContain("por_cobrar");
    const denied = await getDb()
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.workspaceId, ctx.workspaceId), eq(schema.auditLog.action, "ai.tool_denied")));
    expect(denied).toHaveLength(2);

    // El Business Agent sí la tiene
    mockClient([use("ver_finanzas_resumen"), say("## Negocio\nResumen")]);
    const ok = await startRun(ctx, { agentKey: "business", request: "Estado del mes" });
    await processAgentRuns();
    expect((await getRun(ctx, ok.id))?.run.status).toBe("succeeded");
  });

  it("scopes del Ctx: con herramientas de solo lectura, crear tareas es rechazado por permisos", async () => {
    const ctx = await setup();
    // Se le quitan las herramientas de escritura al Content Agent y se fuerza la llamada
    await updateAgent(ctx, "content", { monthlyBudgetUsd: "2", budgetPerRunUsd: "0.2", maxSteps: "10", tools: ["buscar", "proponer_cambio"], prompt: "" });
    mockClient([use("crear_tarea", { titulo: "Hackear" }), say("listo")]);
    const run = await startRun(ctx, { agentKey: "content", request: "Creá una tarea" });
    await processAgentRuns();
    const d = await getRun(ctx, run.id);
    expect(d?.steps.find((s) => s.toolName === "crear_tarea")?.error).toMatch(/no está habilitada/);
    const tasks = await getDb()
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.workspaceId, ctx.workspaceId), eq(schema.task.title, "Hackear")));
    expect(tasks).toHaveLength(0);
    // No se pueden habilitar herramientas fuera del techo del agente
    await expect(
      updateAgent(ctx, "pm", { monthlyBudgetUsd: "2", budgetPerRunUsd: "0.2", maxSteps: "10", tools: ["buscar", "ver_finanzas_resumen"], prompt: "" }),
    ).rejects.toThrow(/no permitidas/);
  });

  it("aprobación requerida: lo que está fuera de alcance se pide con proponer_cambio y queda pendiente", async () => {
    const ctx = await setup();
    const p = await createProject(ctx, { name: "Para borrar" });
    mockClient([
      use("proponer_cambio", { titulo: "Archivar proyecto viejo", detalle: "Lleva 6 meses parado", tipo_entidad: "project", entidad_id: p.id }),
      say("Propuse archivarlo."),
    ]);
    const run = await startRun(ctx, { agentKey: "pm", request: "Limpiá proyectos viejos" });
    await processAgentRuns();
    const d = await getRun(ctx, run.id);
    expect(d?.run.status).toBe("succeeded");
    expect(d?.steps.find((s) => s.toolName === "proponer_cambio")?.kind).toBe("approval");
    const [ap] = await getDb().select().from(schema.approval).where(eq(schema.approval.workspaceId, ctx.workspaceId));
    expect(ap?.status).toBe("pending");
    expect(ap?.requestedByType).toBe("agent");
    expect(ap?.requestedById).toBe("agent:pm");
    expect(((d?.run.outputEntities ?? []) as { type: string; id: string }[]).some((e) => e.type === "approval" && e.id === ap?.id)).toBe(true);
    // El proyecto sigue intacto
    const [still] = await getDb().select().from(schema.project).where(eq(schema.project.id, p.id));
    expect(still?.deletedAt).toBeNull();
  });

  it("Content en una nota: resume y crea tareas reales", async () => {
    const ctx = await setup();
    const n = await createNote(ctx, { title: "Reunión con Tienda", bodyMd: "- Mandar presupuesto el lunes\n- Pedir logo en SVG" });
    const calls = mockClient([
      use("crear_tarea", { titulo: "Mandar presupuesto" }),
      use("crear_tarea", { titulo: "Pedir logo en SVG" }),
      say("## Resumen\n- 2 tareas"),
    ]);
    const run = await startEntityRun(ctx, "note", n.id);
    await processAgentRuns();
    expect((await getRun(ctx, run.id))?.run.status).toBe("succeeded");
    // la nota viaja como dato no confiable
    expect(JSON.stringify(calls[0]?.messages)).toContain("datos_no_confiables");
    expect(JSON.stringify(calls[0]?.messages)).toContain("Pedir logo en SVG");
    const tasks = await getDb()
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.workspaceId, ctx.workspaceId), eq(schema.task.title, "Pedir logo en SVG")));
    expect(tasks).toHaveLength(1);
    expect((await listComments(ctx, "note", n.id))[0]?.c.bodyMd).toContain("Resumen");
  });

  it("tope mensual: si está agotado la ejecución no arranca y se notifica", async () => {
    const ctx = await setup("1");
    await getDb()
      .insert(schema.agentRun)
      .values({ workspaceId: ctx.workspaceId, agentKey: "business", trigger: "manual", status: "succeeded", costUsd: "1.000000", createdBy: ctx.userId });
    const calls = mockClient([say("no")]);
    await expect(startRun(ctx, { agentKey: "pm", request: "Plan" })).rejects.toThrow(/tope mensual/);
    const runs = await listRuns(ctx, { status: "budget_exceeded" });
    expect(runs).toHaveLength(1);
    const [ev] = await getDb()
      .select()
      .from(schema.domainEvent)
      .where(and(eq(schema.domainEvent.workspaceId, ctx.workspaceId), eq(schema.domainEvent.type, "agente.presupuesto_excedido")));
    expect(ev?.actorType).toBe("agent");
    await processAgentRuns();
    expect(calls).toHaveLength(0); // nunca llamó al modelo
  });

  it("tope por agente y por ejecución: corta a mitad con budget_exceeded", async () => {
    const ctx = await setup();
    // 100k tokens de salida en Sonnet 5.5 = US$ 1 > tope por ejecución de US$ 0.20
    mockClient([{ ...use("ver_hoy"), usage: { input_tokens: 1000, output_tokens: 100_000 } }, say("no debería llegar")]);
    const run = await startRun(ctx, { agentKey: "pm", request: "Plan grande" });
    await processAgentRuns();
    const d = await getRun(ctx, run.id);
    expect(d?.run.status).toBe("budget_exceeded");
    expect(d?.run.costUsd).toBe("1.002000");
    // y ahora el PM superó su tope mensual (US$ 2 por defecto)? No: 1.002 < 2. Bajamos el tope del agente.
    await updateAgent(ctx, "pm", { monthlyBudgetUsd: "1", budgetPerRunUsd: "0.2", maxSteps: "10", tools: ["buscar", "ver_proyecto"], prompt: "" });
    await expect(startRun(ctx, { agentKey: "pm", request: "Otro" })).rejects.toThrow(/tope mensual del agente/);
    // otro agente sigue funcionando
    mockClient([say("ok")]);
    const other = await startRun(ctx, { agentKey: "business", request: "Estado" });
    await processAgentRuns();
    expect((await getRun(ctx, other.id))?.run.status).toBe("succeeded");
  });

  it("prompt editable con versión, desactivar agente y cancelar", async () => {
    const ctx = await setup();
    const a = await updateAgent(ctx, "pm", {
      monthlyBudgetUsd: "2",
      budgetPerRunUsd: "0.2",
      maxSteps: "5",
      tools: ["buscar", "ver_proyecto"],
      prompt: "Sé breve.",
    });
    expect(a?.systemPromptVersion).toBe("2");
    expect((await providerState(ctx)).customPrompts).toContain("pm");
    const calls = mockClient([say("ok")]);
    const run = await startRun(ctx, { agentKey: "pm", request: "Algo" });
    await processAgentRuns();
    expect(String(calls[0]?.system)).toContain("Sé breve.");
    expect((await getRun(ctx, run.id))?.run.status).toBe("succeeded");

    const queued = await startRun(ctx, { agentKey: "pm", request: "Otra" });
    await cancelRun(ctx, queued.id);
    await processAgentRuns();
    expect((await getRun(ctx, queued.id))?.run.status).toBe("cancelled");
    await expect(cancelRun(ctx, queued.id)).rejects.toThrow();

    await setAgentEnabled(ctx, "pm", false);
    expect((await availableAgents(ctx)).has("pm")).toBe(false);
    await expect(startRun(ctx, { agentKey: "pm", request: "Otro pedido" })).rejects.toThrow(/desactivado/);
  });

  it("aislamiento A/B: A no ve, no cancela ni usa entidades de B", async () => {
    const a = await setup();
    const b = await setup();
    const pb = await createProject(b, { name: "Secreto de B" });
    mockClient([say("ok")]);
    const runB = await startRun(b, { agentKey: "pm", request: "Plan B" });
    await processAgentRuns();
    expect(await getRun(a, runB.id)).toBeNull();
    expect((await listRuns(a)).find((r) => r.id === runB.id)).toBeUndefined();
    await expect(cancelRun(a, runB.id)).rejects.toThrow();
    await expect(startEntityRun(a, "project", pb.id)).rejects.toThrow(/no existe/);
    // Un agente de A que intenta leer el proyecto de B no lo encuentra
    mockClient([use("ver_proyecto", { id: pb.id }), say("No lo encontré")]);
    const runA = await startRun(a, { agentKey: "pm", request: "Mirá ese proyecto" });
    await processAgentRuns();
    const d = await getRun(a, runA.id);
    expect(d?.steps.find((s) => s.toolName === "ver_proyecto")?.error).toMatch(/no existe/);
    expect(JSON.stringify(d?.steps)).not.toContain("Secreto de B");
  });
});
