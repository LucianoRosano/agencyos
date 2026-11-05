import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { addDays, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { decideApproval } from "@agencyos/modules/approvals/service";
import { resumeWaitingRuns, retryFailedRuns, runScheduledRules } from "@agencyos/modules/automations/jobs";
import { getRule, listRules, listRuns } from "@agencyos/modules/automations/queries";
import { signWebhook, verifyWebhookSignature } from "@agencyos/modules/automations/engine";
import {
  createEndpoint,
  createRule,
  createRuleFromTemplate,
  duplicateRule,
  handleEvent,
  previewRule,
  receiveWebhook,
  runRuleNow,
  setRuleActive,
  updateRule,
} from "@agencyos/modules/automations/service";
import { createClient } from "@agencyos/modules/crm/service";
import { createProject } from "@agencyos/modules/projects/service";
import { createTask } from "@agencyos/modules/tasks/service";
import { moveToTrash } from "@agencyos/modules/trash/service";
import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

const db = () => getDb();

async function lastEvent(workspaceId: string, type: string, entityId?: string) {
  const rows = await db()
    .select()
    .from(schema.domainEvent)
    .where(and(eq(schema.domainEvent.workspaceId, workspaceId), eq(schema.domainEvent.type, type), ...(entityId ? [eq(schema.domainEvent.entityId, entityId)] : [])))
    .orderBy(desc(schema.domainEvent.occurredAt), desc(schema.domainEvent.id))
    .limit(1);
  const ev = rows[0];
  if (!ev) throw new Error(`sin evento ${type}`);
  return ev;
}

const tasksOf = (workspaceId: string) => db().select().from(schema.task).where(eq(schema.task.workspaceId, workspaceId));
const runsOf = (ruleId: string) => db().select().from(schema.automationRun).where(eq(schema.automationRun.ruleId, ruleId));

const projectRule = (actions: unknown[] = [{ type: "create_task", params: { title: "Preparar {{proyecto.nombre}}", project: "event", dueInDays: 1 } }]) => ({
  name: "Proyecto → tarea",
  triggerKind: "event",
  eventType: "proyecto.creado",
  conditions: { match: "all", items: [] },
  actions,
});

describe("automatizaciones: reglas por evento", () => {
  it("evento → regla → tarea creada en el proyecto, con registro de la ejecución", async () => {
    const ctx = await makeWorkspace();
    const rule = await createRule(ctx, projectRule());
    const p = await createProject(ctx, { name: "Sitio Pampa" });
    const ev = await lastEvent(ctx.workspaceId, "proyecto.creado", p.id);
    expect(await handleEvent(ev)).toBe(1);
    const t = (await tasksOf(ctx.workspaceId)).find((x) => x.title === "Preparar Sitio Pampa");
    expect(t?.projectId).toBe(p.id);
    expect(t?.dueDate).toBe(addDays(todayAR(), 1));
    const [run] = await listRuns(ctx, rule.id);
    expect(run?.status).toBe("succeeded");
    expect((run?.output as { results: { summary: string }[] }).results[0]?.summary).toContain("Preparar Sitio Pampa");
    expect((run?.input as { datos: { proyecto: { nombre: string } } }).datos.proyecto.nombre).toBe("Sitio Pampa");
    // la actividad muestra al actor "Automatización"
    const [act] = await db()
      .select()
      .from(schema.activity)
      .where(and(eq(schema.activity.workspaceId, ctx.workspaceId), eq(schema.activity.entityId, t?.id ?? "")));
    expect(act?.actorName).toBe("Automatización");
  });

  it("idempotencia: el mismo evento dos veces ejecuta una sola vez", async () => {
    const ctx = await makeWorkspace();
    const rule = await createRule(ctx, projectRule());
    const p = await createProject(ctx, { name: "Doble" });
    const ev = await lastEvent(ctx.workspaceId, "proyecto.creado", p.id);
    await handleEvent(ev);
    expect(await handleEvent(ev)).toBe(0);
    expect((await tasksOf(ctx.workspaceId)).filter((x) => x.title === "Preparar Doble")).toHaveLength(1);
    expect(await runsOf(rule.id)).toHaveLength(1);
  });

  it("condiciones: si no se cumplen, la ejecución queda omitida y no hace nada", async () => {
    const ctx = await makeWorkspace();
    const rule = await createRule(ctx, {
      ...projectRule(),
      conditions: { match: "all", items: [{ field: "proyecto.tipo", op: "eq", value: "website" }] },
    });
    const p = await createProject(ctx, { name: "Personal", kind: "personal" });
    await handleEvent(await lastEvent(ctx.workspaceId, "proyecto.creado", p.id));
    const [run] = await runsOf(rule.id);
    expect(run?.status).toBe("skipped");
    expect((await tasksOf(ctx.workspaceId)).some((x) => x.title.startsWith("Preparar"))).toBe(false);
  });

  it("esperar N días → la ejecución queda en espera y el job la retoma", async () => {
    const ctx = await makeWorkspace();
    const rule = await createRule(ctx, projectRule([{ type: "wait", params: { days: 3 } }, { type: "notify", params: { title: "Pasaron 3 días de {{proyecto.nombre}}" } }]));
    const p = await createProject(ctx, { name: "Lento" });
    await handleEvent(await lastEvent(ctx.workspaceId, "proyecto.creado", p.id));
    let [run] = await runsOf(rule.id);
    expect(run?.status).toBe("waiting");
    expect(run?.resumeAt && run.resumeAt.getTime() - Date.now()).toBeGreaterThan(2.9 * 86_400_000);
    // todavía no venció
    await resumeWaitingRuns();
    [run] = await runsOf(rule.id);
    expect(run?.status).toBe("waiting");
    await db()
      .update(schema.automationRun)
      .set({ resumeAt: new Date(Date.now() - 1000) })
      .where(eq(schema.automationRun.id, run?.id ?? ""));
    expect(await resumeWaitingRuns()).toBeGreaterThanOrEqual(1);
    [run] = await runsOf(rule.id);
    expect(run?.status).toBe("succeeded");
    expect((run?.output as { results: unknown[] }).results).toHaveLength(2);
    const notes = await db().select().from(schema.notification).where(eq(schema.notification.workspaceId, ctx.workspaceId));
    expect(notes.some((n) => n.title === "Pasaron 3 días de Lento")).toBe(true);
  });

  it("email a un cliente crea una aprobación (no se envía solo); al rechazarla se cierra", async () => {
    const ctx = await makeWorkspace();
    const rule = await createRule(ctx, {
      name: "Bienvenida",
      triggerKind: "event",
      eventType: "cliente.creado",
      conditions: { match: "all", items: [] },
      actions: [{ type: "send_email", params: { to: "client", subject: "Hola {{cliente.nombre}}", body: "Bienvenido, {{cliente.contacto}}." } }],
    });
    const c = await createClient(ctx, { name: "Panadería Sol", contactName: "Ana", contactEmail: "ana@sol.com.ar" });
    await handleEvent(await lastEvent(ctx.workspaceId, "cliente.creado", c.id));
    const [run] = await runsOf(rule.id);
    expect(run?.status).toBe("waiting_approval");
    const [ap] = await db().select().from(schema.approval).where(eq(schema.approval.workspaceId, ctx.workspaceId));
    expect(ap?.kind).toBe("automation_email");
    expect(ap?.status).toBe("pending");
    expect((ap?.proposal as { email: { to: string; subject: string; text: string } }).email).toEqual({
      to: "ana@sol.com.ar",
      subject: "Hola Panadería Sol",
      text: "Bienvenido, Ana.",
    });
    await decideApproval(ctx, ap?.id ?? "", "rejected");
    await handleEvent(await lastEvent(ctx.workspaceId, "aprobacion.rechazada"));
    const [after] = await runsOf(rule.id);
    expect(after?.status).toBe("succeeded");
    expect(JSON.stringify(after?.output)).toContain("rechazado");
  });

  it("modo prueba: la vista previa no escribe nada y una regla en modo prueba solo registra", async () => {
    const ctx = await makeWorkspace();
    const rule = await createRule(ctx, projectRule());
    const p = await createProject(ctx, { name: "Probeta" });
    const before = (await tasksOf(ctx.workspaceId)).length;
    const prev = await previewRule(ctx, rule.id);
    expect(prev.empty).toBe(false);
    if (!prev.empty) expect(prev.items[0]?.result.output.results[0]?.summary).toBe("Crearía la tarea «Preparar Probeta» en «Probeta»");
    expect((await tasksOf(ctx.workspaceId)).length).toBe(before);
    expect(await runsOf(rule.id)).toHaveLength(0);

    const test = await createRule(ctx, { ...projectRule(), testMode: true });
    await handleEvent(await lastEvent(ctx.workspaceId, "proyecto.creado", p.id));
    const [run] = await runsOf(test.id);
    expect(run?.dryRun).toBe(true);
    expect(run?.status).toBe("succeeded");
    // la regla real (no en prueba) sí creó la suya; la de prueba no agregó otra
    expect((await tasksOf(ctx.workspaceId)).filter((x) => x.title === "Preparar Probeta")).toHaveLength(1);
  });

  it("ejecutar con el último evento real (una sola vez por evento)", async () => {
    const ctx = await makeWorkspace();
    await createProject(ctx, { name: "Previo" });
    const rule = await createRuleFromTemplate(ctx, "proyecto-creado-preparar");
    const r = await runRuleNow(ctx, rule.id);
    expect(r.runs).toBe(1);
    expect((await tasksOf(ctx.workspaceId)).some((t) => t.title === "Preparar carpeta y accesos de Previo")).toBe(true);
    await expect(runRuleNow(ctx, rule.id)).rejects.toThrow(/Ya se ejecutó/);
  });

  it("anti-bucle: una regla no se dispara con los eventos que genera ella misma", async () => {
    const ctx = await makeWorkspace();
    const rule = await createRule(ctx, {
      name: "Tarea → tarea",
      triggerKind: "event",
      eventType: "tarea.creada",
      conditions: { match: "all", items: [] },
      actions: [{ type: "create_task", params: { title: "Eco de {{tarea.titulo}}", project: "none" } }],
    });
    const t = await createTask(ctx, { title: "Original" });
    await handleEvent(await lastEvent(ctx.workspaceId, "tarea.creada", t.id));
    const eco = (await tasksOf(ctx.workspaceId)).find((x) => x.title === "Eco de Original");
    expect(eco).toBeDefined();
    const ecoEvent = await lastEvent(ctx.workspaceId, "tarea.creada", eco?.id);
    expect(ecoEvent.actorId).toBe(`automation:${rule.id}`);
    expect(await handleEvent(ecoEvent)).toBe(0);
    expect(await runsOf(rule.id)).toHaveLength(1);
  });

  it("aislamiento A/B: B no ve ni edita reglas de A, y los eventos de B no disparan reglas de A", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    const ruleA = await createRule(a, projectRule());
    expect(await getRule(b, ruleA.id)).toBeNull();
    expect((await listRules(b)).length).toBe(0);
    await expect(updateRule(b, ruleA.id, projectRule())).rejects.toThrow(/no existe/);
    await expect(setRuleActive(b, ruleA.id, false)).rejects.toThrow();
    await expect(duplicateRule(b, ruleA.id)).rejects.toThrow();
    await expect(previewRule(b, ruleA.id)).rejects.toThrow();
    await expect(moveToTrash(b, "automation_rule", ruleA.id)).rejects.toThrow();
    const pb = await createProject(b, { name: "De B" });
    await handleEvent(await lastEvent(b.workspaceId, "proyecto.creado", pb.id));
    expect(await runsOf(ruleA.id)).toHaveLength(0);
    // un webhook saliente de B no se puede usar en una regla de A
    const epB = await createEndpoint(b, { direction: "out", name: "n8n B", url: "https://example.com/hook" });
    await expect(createRule(a, projectRule([{ type: "webhook", params: { endpointId: epB.id } }]))).rejects.toThrow(/webhook saliente/);
  });

  it("permisos: un miembro no administra reglas y una regla no escala permisos de su creador", async () => {
    const ctx = await makeWorkspace();
    const member = { ...ctx, role: "member" as const };
    await expect(createRule(member, projectRule())).rejects.toThrow(/permiso/);
    const ep = await createEndpoint(ctx, { direction: "out", name: "Hook", url: "https://example.com/hook" });
    const rule = await createRule(ctx, projectRule([{ type: "webhook", params: { endpointId: ep.id } }]));
    // el creador pasa a ser miembro: la regla ya no puede usar webhooks (requiere Configuración)
    await db()
      .update(schema.membership)
      .set({ role: "member" })
      .where(and(eq(schema.membership.workspaceId, ctx.workspaceId), eq(schema.membership.userId, ctx.userId ?? "")));
    const p = await createProject(ctx, { name: "Sin escalada" });
    await handleEvent(await lastEvent(ctx.workspaceId, "proyecto.creado", p.id));
    const [run] = await runsOf(rule.id);
    expect(run?.status).toBe("failed");
    expect(run?.error).toMatch(/permiso/);
    expect((run?.output as { retryable: boolean }).retryable).toBe(false);
  });

  it("límite de 20 acciones por regla", async () => {
    const ctx = await makeWorkspace();
    const many = Array.from({ length: 21 }, () => ({ type: "notify", params: { title: "x" } }));
    await expect(createRule(ctx, projectRule(many))).rejects.toThrow();
  });
});

describe("automatizaciones: programadas", () => {
  it("tarea vencida hace 3 días → notificación, una sola vez por tarea", async () => {
    const ctx = await makeWorkspace();
    const rule = await createRuleFromTemplate(ctx, "tarea-vencida-notificar");
    await createTask(ctx, { title: "Atrasada", dueDate: addDays(todayAR(), -5) });
    await createTask(ctx, { title: "Reciente", dueDate: addDays(todayAR(), -1) });
    // fuerza la creación de la regla al pasado para que el horario de hoy 9:00 quede en la ventana
    await db()
      .update(schema.automationRule)
      .set({ createdAt: new Date(Date.now() - 2 * 86_400_000) })
      .where(eq(schema.automationRule.id, rule.id));
    const nine = new Date(`${todayAR()}T12:05:00Z`); // 9:05 ART
    expect(await runScheduledRules(nine)).toBeGreaterThanOrEqual(1);
    await runScheduledRules(nine);
    const runs = await runsOf(rule.id);
    expect(runs).toHaveLength(1);
    const notes = await db().select().from(schema.notification).where(eq(schema.notification.workspaceId, ctx.workspaceId));
    expect(notes.filter((n) => n.title.includes("Atrasada"))).toHaveLength(1);
    expect(notes.some((n) => n.title.includes("Reciente"))).toBe(false);
    // fuera de horario no corre
    const otherWs = await makeWorkspace();
    const r2 = await createRuleFromTemplate(otherWs, "tarea-vencida-notificar");
    await createTask(otherWs, { title: "Otra", dueDate: addDays(todayAR(), -9) });
    await runScheduledRules(new Date(`${todayAR()}T18:00:00Z`));
    expect(await runsOf(r2.id)).toHaveLength(0);
  });
});

describe("webhooks", () => {
  it("entrante: válido genera webhook.recibido; inválido, vencido o repetido se rechaza", async () => {
    const ctx = await makeWorkspace();
    const ep = await createEndpoint(ctx, { direction: "in", name: "Formulario web" });
    expect(ep.secret).toMatch(/^whsec_/);
    const rule = await createRule(ctx, {
      name: "Formulario → tarea",
      triggerKind: "event",
      eventType: "webhook.recibido",
      conditions: { match: "all", items: [{ field: "payload.datos.tipo", op: "eq", value: "consulta" }] },
      actions: [{ type: "create_task", params: { title: "Responder a {{payload.datos.nombre}}", project: "none" } }],
    });
    const body = JSON.stringify({ tipo: "consulta", nombre: "Marta" });
    const now = Math.floor(Date.now() / 1000);
    const sig = signWebhook(ep.secret, body, now);
    const ok = await receiveWebhook(ep.id, body, sig, now);
    expect(ok.status).toBe(202);
    expect((await receiveWebhook(ep.id, body, sig, now)).status).toBe(409);
    expect((await receiveWebhook(ep.id, body, signWebhook("otro", body, now), now)).status).toBe(401);
    expect((await receiveWebhook(ep.id, body, signWebhook(ep.secret, body, now - 400), now)).status).toBe(401);
    expect((await receiveWebhook(ep.id, body, null, now)).status).toBe(401);
    expect((await receiveWebhook("00000000-0000-0000-0000-000000000000", body, sig, now)).status).toBe(404);
    const ev = await lastEvent(ctx.workspaceId, "webhook.recibido");
    expect(ev.id).toBe(ok.eventId);
    await handleEvent(ev);
    expect((await tasksOf(ctx.workspaceId)).some((t) => t.title === "Responder a Marta")).toBe(true);
    expect(await runsOf(rule.id)).toHaveLength(1);
    // el secreto se guarda cifrado
    const [row] = await db().select().from(schema.webhookEndpoint).where(eq(schema.webhookEndpoint.id, ep.id));
    expect(row?.secretEnc?.toString("utf8").includes(ep.secret)).toBe(false);
  });

  describe("saliente", () => {
    let server: Server;
    let url = "";
    const received: { sig: string; body: string }[] = [];
    let failNext = 0;
    beforeAll(async () => {
      process.env.AUTOMATIONS_WEBHOOK_ALLOW_LOCAL = "1";
      server = createServer((req, res) => {
        let b = "";
        req.on("data", (c) => {
          b += c;
        });
        req.on("end", () => {
          received.push({ sig: String(req.headers["x-agencyos-signature"] ?? ""), body: b });
          if (failNext > 0) {
            failNext--;
            res.writeHead(500).end("caído");
          } else res.writeHead(200).end("ok");
        });
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    });
    afterAll(async () => {
      delete process.env.AUTOMATIONS_WEBHOOK_ALLOW_LOCAL;
      await new Promise((r) => server.close(r));
    });

    it("POST firmado con HMAC, registro de la entrega y reintento exponencial ante un 500", async () => {
      const ctx = await makeWorkspace();
      const ep = await createEndpoint(ctx, { direction: "out", name: "n8n", url });
      const rule = await createRule(ctx, projectRule([{ type: "webhook", params: { endpointId: ep.id } }]));
      failNext = 1;
      const p = await createProject(ctx, { name: "Con webhook" });
      await handleEvent(await lastEvent(ctx.workspaceId, "proyecto.creado", p.id));
      let [run] = await runsOf(rule.id);
      expect(run?.status).toBe("failed");
      expect((run?.output as { retryable: boolean }).retryable).toBe(true);
      // todavía no pasó la espera (2 min)
      expect(await retryFailedRuns()).toBe(0);
      expect(await retryFailedRuns(new Date(Date.now() + 3 * 60_000))).toBe(1);
      [run] = await runsOf(rule.id);
      expect(run?.status).toBe("succeeded");
      expect(run?.attempt).toBe(2);
      const last = received.at(-1);
      expect(last && verifyWebhookSignature(ep.secret, last.body, last.sig).ok).toBe(true);
      expect(JSON.parse(last?.body ?? "{}").datos.proyecto.nombre).toBe("Con webhook");
      const deliveries = await db().select().from(schema.webhookDelivery).where(eq(schema.webhookDelivery.endpointId, ep.id));
      expect(deliveries.map((d) => d.statusCode).sort()).toEqual([200, 500]);
    });
  });
});
