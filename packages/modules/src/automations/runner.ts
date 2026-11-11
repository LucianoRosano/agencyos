import { addDays, assertCan, type Ctx, DomainError, notFound, type Role, todayAR, validation } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { type DbOrTx, schema } from "@agencyos/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { setProjectStatus } from "../projects/service";
import { decryptSecret } from "../shared/crypto";
import { getDb, scoped } from "../shared/db";
import { sendEmail } from "../shared/email";
import { safeFetch } from "../shared/safe-fetch";
import { createTask, setTaskStatus } from "../tasks/service";
import { ACTION_TYPES, MAX_RUNS_PER_MINUTE } from "./catalog";
import { buildRunData, type RunData, type TriggerEvent } from "./data";
import { evaluateConditions, interpolate, MAX_ATTEMPTS, SIGNATURE_HEADER, signWebhook } from "./engine";
import { actionZ } from "./validators";

export type RuleRow = typeof schema.automationRule.$inferSelect;
export type RunRow = typeof schema.automationRun.$inferSelect;
export type RuleSource = { kind: string; days?: number };
export type StoredConditions = RuleRow["conditions"] & { source?: RuleSource };

export type ActionResult = {
  index: number;
  type: string;
  ok: boolean;
  summary: string;
  detail?: string;
  data?: Record<string, unknown>;
  pendingApproval?: boolean;
};
export type RunOutput = {
  step: number;
  results: ActionResult[];
  conditions?: { field: string; op: string; value?: string; passed: boolean }[];
  reason?: string;
  retryable?: boolean;
};

export const ruleSource = (rule: Pick<RuleRow, "conditions">): RuleSource | null => {
  const s = (rule.conditions as StoredConditions).source;
  return s && s.kind !== "none" ? s : null;
};

export const AUTOMATION_ACTOR = (ruleId: string) => `automation:${ruleId}`;

/**
 * Contexto de ejecución: actor de sistema "Automatización" (para la actividad y el anti-bucle),
 * con el rol ACTUAL de quien creó la regla. Cada acción además verifica permisos como si fuera esa persona:
 * una regla nunca puede hacer algo que su creador no puede (sin escalada).
 */
export function automationCtx(rule: Pick<RuleRow, "id" | "workspaceId" | "createdBy">, role: Role): Ctx {
  return { workspaceId: rule.workspaceId, userId: rule.createdBy, role, actor: { type: "system", id: AUTOMATION_ACTOR(rule.id), name: "Automatización" } };
}
const asCreator = (ctx: Ctx): Ctx => ({ ...ctx, actor: { ...ctx.actor, type: "user" } });

export async function creatorRole(db: DbOrTx, workspaceId: string, userId: string | null): Promise<Role | null> {
  if (!userId) return null;
  const [m] = await db
    .select({ role: schema.membership.role, status: schema.membership.status })
    .from(schema.membership)
    .where(and(eq(schema.membership.workspaceId, workspaceId), eq(schema.membership.userId, userId)));
  if (!m || m.status !== "active") return null;
  return m.role as Role;
}

const isRetryable = (e: unknown) => !(e instanceof DomainError && e.code !== "EXTERNAL") && !(e && typeof e === "object" && "issues" in e);
const errMessage = (e: unknown) => {
  if (e instanceof DomainError) return e.message;
  if (e && typeof e === "object" && "issues" in e) {
    const i = (e as { issues: { path: (string | number)[]; message: string }[] }).issues[0];
    return `Parámetros inválidos: ${i?.message ?? ""}`;
  }
  return e instanceof Error ? e.message : String(e);
};

/** Webhook saliente. `AUTOMATIONS_WEBHOOK_ALLOW_LOCAL=1` (solo fuera de producción, para tests) permite destinos locales. */
async function postWebhook(url: string, body: string, headers: Record<string, string>) {
  if (process.env.AUTOMATIONS_WEBHOOK_ALLOW_LOCAL === "1" && process.env.NODE_ENV !== "production") {
    const r = await fetch(url, { method: "POST", body, headers, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    return { status: r.status, text: (await r.text()).slice(0, 500) };
  }
  const r = await safeFetch(url, { method: "POST", body, headers, timeoutMs: 10_000, maxRedirects: 0, maxBytes: 64 * 1024 });
  return { status: r.status, text: r.body.toString("utf8").slice(0, 500) };
}

type ExecEnv = { rule: RuleRow; ctx: Ctx; data: RunData; runId: string | null; eventId: string | null; dryRun: boolean };

/** Ejecuta (o simula) una acción. Devuelve el resultado o una pausa de N días. */
async function performAction(env: ExecEnv, index: number, raw: unknown): Promise<ActionResult | { wait: number; result: ActionResult }> {
  const parsed = actionZ.safeParse(raw);
  if (!parsed.success) throw validation(`La acción ${index + 1} tiene parámetros inválidos`);
  const a = parsed.data;
  const { ctx, data, dryRun } = env;
  const db = getDb();
  const base = { index, type: a.type, ok: true };
  const proyecto = data.proyecto as { id?: string; nombre?: string } | undefined;
  switch (a.type) {
    case "create_task": {
      assertCan(asCreator(ctx), "create", "task");
      const title = interpolate(a.params.title, data).trim().slice(0, 300) || "Tarea de automatización";
      const descriptionMd = a.params.description ? interpolate(a.params.description, data).slice(0, 20000) : undefined;
      const dueDate = a.params.dueInDays !== undefined ? addDays(todayAR(), a.params.dueInDays) : undefined;
      const projectId = a.params.project === "event" ? proyecto?.id : undefined;
      const where = projectId ? ` en «${proyecto?.nombre ?? "el proyecto"}»` : "";
      if (dryRun) return { ...base, summary: `Crearía la tarea «${title}»${where}`, detail: descriptionMd };
      const t = await createTask(ctx, { title, descriptionMd, priority: a.params.priority, dueDate, projectId });
      return { ...base, summary: `Creó la tarea «${t.title}»${where}`, data: { taskId: t.id } };
    }
    case "notify": {
      const title = interpolate(a.params.title, data).trim().slice(0, 200) || "Automatización";
      const body = a.params.body ? interpolate(a.params.body, data).slice(0, 2000) : null;
      if (dryRun) return { ...base, summary: `Te notificaría: «${title}»`, detail: body ?? undefined };
      const admins = await db
        .select({ userId: schema.membership.userId })
        .from(schema.membership)
        .where(
          and(eq(schema.membership.workspaceId, ctx.workspaceId), eq(schema.membership.status, "active"), sql`${schema.membership.role} in ('owner','admin')`),
        );
      const ent = data.entidad as { id?: string; tipo?: string } | undefined;
      for (const m of admins) {
        await db
          .insert(schema.notification)
          .values({
            workspaceId: ctx.workspaceId,
            userId: m.userId,
            type: "automatizacion.notificacion",
            title,
            body,
            entityType: ent?.tipo ?? "automation_rule",
            entityId: ent?.id ?? env.rule.id,
            dedupeKey: `auto:${env.runId ?? "x"}:${index}`,
          })
          .onConflictDoNothing();
      }
      return { ...base, summary: `Notificó: «${title}»` };
    }
    case "send_email": {
      const subject = interpolate(a.params.subject, data).trim().slice(0, 200);
      const text = interpolate(a.params.body, data).slice(0, 10000);
      if (a.params.to === "owner") {
        const [u] = ctx.userId ? await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, ctx.userId)) : [];
        if (!u) throw validation("La regla no tiene a quién enviarle el email");
        if (dryRun) return { ...base, summary: `Te enviaría el email «${subject}»`, detail: text };
        const sent = await sendEmail({ to: u.email, subject, text });
        if (!sent) throw new DomainError("EXTERNAL", "No se pudo enviar el email (revisá que Brevo esté configurado)");
        return { ...base, summary: `Te envió el email «${subject}»` };
      }
      const cliente = data.cliente as { id?: string; nombre?: string; email?: string | null } | undefined;
      if (!cliente?.id) throw validation("El evento no tiene un cliente asociado para enviarle el email");
      if (!cliente.email) throw validation(`«${cliente.nombre}» no tiene un contacto con email`);
      if (a.params.automatic) {
        if (dryRun) return { ...base, summary: `Enviaría a ${cliente.email} (automático, sin revisión) «${subject}»`, detail: text };
        const sent = await sendEmail({ to: cliente.email, subject, text });
        if (!sent) throw new DomainError("EXTERNAL", "No se pudo enviar el email (revisá que Brevo esté configurado)");
        return { ...base, summary: `Envió a ${cliente.email} «${subject}» (automático)` };
      }
      assertCan(asCreator(ctx), "create", "approval");
      if (dryRun) return { ...base, summary: `Pediría tu aprobación para enviar a ${cliente.email} «${subject}»`, detail: text, pendingApproval: true };
      const approvalId = await db.transaction(async (t) => {
        const [ap] = await t
          .insert(schema.approval)
          .values({
            workspaceId: ctx.workspaceId,
            createdBy: ctx.userId,
            kind: "automation_email",
            requestedByType: "system",
            requestedById: ctx.actor.id,
            title: `Enviar email a ${cliente.nombre}: ${subject}`.slice(0, 300),
            entityType: "client",
            entityId: cliente.id,
            proposal: {
              detalle: `Automatización «${env.rule.name}»\nPara: ${cliente.email}\nAsunto: ${subject}\n\n${text}`,
              email: { to: cliente.email, subject, text },
              ruleId: env.rule.id,
              runId: env.runId,
              index,
            },
          })
          .returning({ id: schema.approval.id });
        await recordEvent(t, ctx, {
          type: "aprobacion.solicitada",
          entityType: "approval",
          entityId: ap?.id,
          summary: `Automatización «${env.rule.name}» pide aprobar un email a ${cliente.nombre}`,
        });
        return ap?.id ?? null;
      });
      return { ...base, summary: `Email a ${cliente.email} esperando tu aprobación`, data: { approvalId }, pendingApproval: true };
    }
    case "set_status": {
      if (a.params.target === "task") {
        const tarea = data.tarea as { id?: string; titulo?: string } | undefined;
        if (!tarea?.id) throw validation("El evento no tiene una tarea para cambiarle el estado");
        assertCan(asCreator(ctx), "update", "task");
        if (dryRun) return { ...base, summary: `Pasaría la tarea «${tarea.titulo}» a ${a.params.status}` };
        await setTaskStatus(ctx, tarea.id, a.params.status as "done");
        return { ...base, summary: `Cambió el estado de la tarea «${tarea.titulo}»`, data: { taskId: tarea.id, status: a.params.status } };
      }
      if (!proyecto?.id) throw validation("El evento no tiene un proyecto para cambiarle el estado");
      assertCan(asCreator(ctx), "update", "project");
      if (dryRun) return { ...base, summary: `Pasaría el proyecto «${proyecto.nombre}» a ${a.params.status}` };
      await setProjectStatus(ctx, proyecto.id, a.params.status as "done");
      return { ...base, summary: `Cambió el estado del proyecto «${proyecto.nombre}»`, data: { projectId: proyecto.id, status: a.params.status } };
    }
    case "webhook": {
      assertCan(asCreator(ctx), "update", "settings");
      const [ep] = await db
        .select()
        .from(schema.webhookEndpoint)
        .where(and(scoped(schema.webhookEndpoint, ctx), eq(schema.webhookEndpoint.id, a.params.endpointId), eq(schema.webhookEndpoint.direction, "out")));
      if (!ep || !ep.url || !ep.secretEnc) throw notFound("El webhook saliente");
      if (!ep.active) throw validation(`El webhook «${ep.name}» está pausado`);
      if (dryRun) return { ...base, summary: `Enviaría un POST firmado a «${ep.name}» (${new URL(ep.url).host})` };
      const body = JSON.stringify({
        id: env.runId,
        regla: { id: env.rule.id, nombre: env.rule.name },
        evento: data.evento,
        datos: Object.fromEntries(Object.entries(data).filter(([k]) => k !== "evento")),
      });
      const signature = signWebhook(decryptSecret(ep.secretEnc), body);
      let status = 0;
      let excerpt = "";
      try {
        const r = await postWebhook(ep.url, body, {
          "content-type": "application/json",
          [SIGNATURE_HEADER]: signature,
          "x-agencyos-event": String((data.evento as { tipo?: string }).tipo ?? ""),
        });
        status = r.status;
        excerpt = r.text;
      } catch (e) {
        excerpt = errMessage(e).slice(0, 500);
      }
      await db.insert(schema.webhookDelivery).values({
        workspaceId: ctx.workspaceId,
        endpointId: ep.id,
        eventId: env.eventId,
        statusCode: status || null,
        responseExcerpt: excerpt || null,
      });
      if (status < 200 || status >= 300)
        throw new DomainError("EXTERNAL", status ? `El webhook «${ep.name}» respondió ${status}` : `No se pudo conectar con «${ep.name}»: ${excerpt}`);
      return { ...base, summary: `Webhook «${ep.name}» respondió ${status}` };
    }
    case "wait": {
      const result = { ...base, summary: dryRun ? `Esperaría ${a.params.days} días y seguiría` : `Espera ${a.params.days} días` };
      return dryRun ? result : { wait: a.params.days, result };
    }
    default:
      throw validation(`Acción desconocida: ${(a as { type: string }).type}`);
  }
}

async function finish(runId: string, values: Partial<typeof schema.automationRun.$inferInsert>) {
  await getDb().update(schema.automationRun).set(values).where(eq(schema.automationRun.id, runId));
}

async function emitRunEvent(ctx: Ctx, rule: RuleRow, runId: string, ok: boolean, msg: string) {
  await getDb().transaction((t) =>
    recordEvent(t, ctx, {
      type: ok ? "automatizacion.ejecutada" : "automatizacion.fallida",
      entityType: "automation_rule",
      entityId: rule.id,
      summary: ok ? `Se ejecutó «${rule.name}»: ${msg}` : `Falló «${rule.name}»: ${msg}`,
      payload: { runId },
    }),
  );
}

/** Corre las acciones desde `from`. Persiste estado, pausa (esperar) y errores. */
export async function continueRun(
  env: ExecEnv & { runId: string },
  from: number,
  prev: ActionResult[],
  extra: Partial<RunOutput> = {},
): Promise<RunOutput & { status: string }> {
  const results = [...prev];
  const actions = env.rule.actions as unknown[];
  for (let i = from; i < actions.length; i++) {
    try {
      const r = await performAction(env, i, actions[i]);
      if ("wait" in r) {
        results.push(r.result);
        const output: RunOutput = { ...extra, step: i + 1, results };
        await finish(env.runId, { status: "waiting", resumeAt: new Date(Date.now() + r.wait * 86_400_000), output });
        return { ...output, status: "waiting" };
      }
      results.push(r);
    } catch (e) {
      const message = errMessage(e);
      results.push({ index: i, type: String((actions[i] as { type?: string })?.type ?? "?"), ok: false, summary: message });
      const output: RunOutput = { ...extra, step: i, results, retryable: !env.dryRun && isRetryable(e) };
      await finish(env.runId, { status: "failed", error: message.slice(0, 1000), output, finishedAt: new Date(), resumeAt: null });
      if (!env.dryRun) await emitRunEvent(env.ctx, env.rule, env.runId, false, message).catch(() => undefined);
      return { ...output, status: "failed" };
    }
  }
  const pending = results.some((r) => r.pendingApproval);
  const status = pending && !env.dryRun ? "waiting_approval" : "succeeded";
  const output: RunOutput = { ...extra, step: actions.length, results };
  await finish(env.runId, { status, output, error: null, finishedAt: new Date(), resumeAt: null });
  if (!env.dryRun) {
    const n = results.length;
    await emitRunEvent(env.ctx, env.rule, env.runId, true, `${n} ${n === 1 ? "acción" : "acciones"}`).catch(() => undefined);
  }
  return { ...output, status };
}

export type ExecuteResult = { status: string; runId: string | null; duplicate?: boolean; output: RunOutput };

/**
 * Ejecuta una regla para un disparador. Idempotente por (regla, evento) gracias al índice único de automation_run.
 * `persist: false` = vista previa (no escribe nada, ni siquiera el registro).
 */
export async function executeRule(
  rule: RuleRow,
  trigger: { eventId: string | null; event: TriggerEvent },
  opts: { dryRun?: boolean; persist?: boolean } = {},
): Promise<ExecuteResult> {
  const db = getDb();
  const dryRun = Boolean(opts.dryRun);
  const persist = opts.persist !== false;
  const role = await creatorRole(db, rule.workspaceId, rule.createdBy);
  const data = await buildRunData(db, rule.workspaceId, trigger.event);
  const input = {
    evento: { id: trigger.eventId, tipo: trigger.event.type, entidad: trigger.event.entityType, entidadId: trigger.event.entityId },
    datos: data,
  };

  let runId: string | null = null;
  if (persist) {
    const [run] = await db
      .insert(schema.automationRun)
      .values({ workspaceId: rule.workspaceId, ruleId: rule.id, eventId: trigger.eventId, status: "running", input, dryRun })
      .onConflictDoNothing()
      .returning();
    if (!run) {
      const [existing] = trigger.eventId
        ? await db
            .select()
            .from(schema.automationRun)
            .where(and(eq(schema.automationRun.ruleId, rule.id), eq(schema.automationRun.eventId, trigger.eventId)))
        : [];
      return {
        status: existing?.status ?? "skipped",
        runId: existing?.id ?? null,
        duplicate: true,
        output: (existing?.output as RunOutput) ?? { step: 0, results: [] },
      };
    }
    runId = run.id;
    await db.update(schema.automationRule).set({ lastRunAt: new Date() }).where(eq(schema.automationRule.id, rule.id));
  }

  const skip = async (reason: string, extra: Partial<RunOutput> = {}): Promise<ExecuteResult> => {
    const output: RunOutput = { step: 0, results: [], reason, ...extra };
    if (runId) await finish(runId, { status: "skipped", output, finishedAt: new Date() });
    return { status: "skipped", runId, output };
  };

  if (!role || role === "client") return skip("Quien creó la regla ya no tiene acceso al espacio de trabajo");

  if (persist && !dryRun) {
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.automationRun)
      .where(
        and(
          eq(schema.automationRun.workspaceId, rule.workspaceId),
          eq(schema.automationRun.dryRun, false),
          gt(schema.automationRun.startedAt, new Date(Date.now() - 60_000)),
        ),
      );
    if (n > MAX_RUNS_PER_MINUTE) return skip(`Límite de ${MAX_RUNS_PER_MINUTE} ejecuciones por minuto alcanzado (protección anti-bucle)`);
  }

  const cond = evaluateConditions(rule.conditions, data);
  const conditions = cond.details.map((d) => ({ ...d.condition, passed: d.passed }));
  if (!cond.passed) return skip("No se cumplieron las condiciones", { conditions });

  const ctx = automationCtx(rule, role);
  if (!persist) {
    // vista previa en memoria
    const results: ActionResult[] = [];
    const env: ExecEnv = { rule, ctx, data, runId: null, eventId: trigger.eventId, dryRun: true };
    for (const [i, a] of (rule.actions as unknown[]).entries()) {
      try {
        const r = await performAction(env, i, a);
        results.push("wait" in r ? r.result : r);
      } catch (e) {
        results.push({ index: i, type: String((a as { type?: string })?.type ?? "?"), ok: false, summary: errMessage(e) });
        break;
      }
    }
    return { status: results.every((r) => r.ok) ? "succeeded" : "failed", runId: null, output: { step: results.length, results, conditions } };
  }
  const out = await continueRun({ rule, ctx, data, runId: runId as string, eventId: trigger.eventId, dryRun }, 0, [], { conditions });
  return { status: out.status, runId, output: out };
}

/** Retoma una ejecución (esperar N días o reintento). El llamador ya "reclamó" la fila (status = running). */
export async function resumeRun(run: RunRow): Promise<string> {
  const db = getDb();
  const [rule] = await db
    .select()
    .from(schema.automationRule)
    .where(and(eq(schema.automationRule.id, run.ruleId), eq(schema.automationRule.workspaceId, run.workspaceId), isNull(schema.automationRule.deletedAt)));
  const out = (run.output ?? { step: 0, results: [] }) as RunOutput;
  if (!rule || !rule.active) {
    await finish(run.id, {
      status: "skipped",
      output: { ...out, reason: "La regla se pausó o se eliminó antes de continuar" },
      finishedAt: new Date(),
      resumeAt: null,
    });
    return "skipped";
  }
  const role = await creatorRole(db, rule.workspaceId, rule.createdBy);
  if (!role || role === "client") {
    await finish(run.id, { status: "skipped", output: { ...out, reason: "Quien creó la regla ya no tiene acceso" }, finishedAt: new Date(), resumeAt: null });
    return "skipped";
  }
  const data = ((run.input as { datos?: RunData }).datos ?? {}) as RunData;
  const prev = (out.results ?? []).filter((r) => r.index < out.step);
  const r = await continueRun({ rule, ctx: automationCtx(rule, role), data, runId: run.id, eventId: run.eventId, dryRun: run.dryRun }, out.step ?? 0, prev, {
    conditions: out.conditions,
  });
  return r.status;
}

export const MAX_RUN_ATTEMPTS = MAX_ATTEMPTS;
export const actionLabel = (type: string) => ACTION_TYPES[type]?.label ?? type;
