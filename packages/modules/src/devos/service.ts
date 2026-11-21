import { assertCan, type Ctx, conflict, forbidden, notFound, todayAR, validation, zOptUuid, zRequired } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema, type Tx } from "@agencyos/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { askBrain } from "../brain/knowledge";
import { assertOwned, getDb, scoped } from "../shared/db";

/**
 * Sistema operativo de desarrollo (ADR 0015): skills (procedimientos reutilizables) y objetivos que ejecuta un agente
 * con supervisión. AGENCYOS es el centro de control: guarda el objetivo, el plan, cada paso, los errores y las
 * correcciones; la ejecución la hace Claude Code en tu PC por MCP (con tu suscripción, sin costo extra) o vos.
 * Reglas: el plan lo aprueba una persona; los pasos marcados «con aprobación» (publicar, borrar, escribir al cliente)
 * esperan tu OK; al terminar queda «a revisar» y vos lo aceptás o lo devolvés con comentarios.
 */

export const GOAL_STATUSES = ["draft", "planned", "approved", "running", "blocked", "review", "done", "failed", "cancelled"] as const;
export const STEP_STATUSES = ["pending", "running", "done", "failed", "skipped", "waiting_approval"] as const;
export const STEP_KINDS = ["task", "code", "test", "research", "review", "deploy", "other"] as const;
export const GOAL_LABEL: Record<(typeof GOAL_STATUSES)[number], string> = {
  draft: "Borrador",
  planned: "Plan para aprobar",
  approved: "Listo para ejecutar",
  running: "En ejecución",
  blocked: "Esperando tu OK",
  review: "Para revisar",
  done: "Terminado",
  failed: "Falló",
  cancelled: "Cancelado",
};
export const STEP_LABEL: Record<(typeof STEP_STATUSES)[number], string> = {
  pending: "Pendiente",
  running: "En curso",
  done: "Hecho",
  failed: "Falló",
  skipped: "Salteado",
  waiting_approval: "Esperando tu OK",
};
export const KIND_LABEL: Record<(typeof STEP_KINDS)[number], string> = {
  task: "Tarea",
  code: "Código",
  test: "Pruebas",
  research: "Investigación",
  review: "Revisión",
  deploy: "Publicación",
  other: "Otro",
};

const isHuman = (ctx: Ctx) => ctx.actor.type === "user";
function assertHuman(ctx: Ctx, what: string) {
  if (!isHuman(ctx)) throw forbidden(`${what} lo decide una persona, no el agente.`);
}

// ---------- Skills ----------

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "skill";

const strList = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.split(/[,\n]/) : v), z.array(z.string().trim().min(1).max(60)).max(max).default([]));

export const skillInput = z.object({
  name: zRequired(80, "El nombre"),
  description: zRequired(400, "La descripción"),
  instructionsMd: z.string().trim().min(10, "Escribí las instrucciones (al menos una línea)").max(40_000),
  tools: strList(30),
  tags: strList(12),
});

async function getSkillRow(t: Tx, ctx: Ctx, id: string) {
  const [s] = await t
    .select()
    .from(schema.skill)
    .where(and(eq(schema.skill.id, id), scoped(schema.skill, ctx)));
  if (!s) throw notFound("La skill");
  return s;
}

async function uniqueSkillSlug(t: Tx, ctx: Ctx, base: string, exceptId?: string) {
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [hit] = await t
      .select({ id: schema.skill.id })
      .from(schema.skill)
      .where(and(eq(schema.skill.workspaceId, ctx.workspaceId), eq(schema.skill.slug, slug)));
    if (!hit || hit.id === exceptId) return slug;
  }
  return `${base}-${Date.now()}`;
}

export async function createSkill(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "manage", "agent");
  const input = skillInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .insert(schema.skill)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, slug: await uniqueSkillSlug(t, ctx, slugify(input.name)), ...input })
      .returning();
    if (!row) throw new Error("No se pudo crear la skill");
    await recordEvent(t, ctx, { type: "skill.creada", entityType: "skill", entityId: row.id, summary: `Creó la skill «${row.name}»` });
    return row;
  });
}

export async function updateSkill(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "manage", "agent");
  const input = skillInput.parse(raw);
  return getDb().transaction(async (t) => {
    const before = await getSkillRow(t, ctx, id);
    const [row] = await t
      .update(schema.skill)
      .set({ ...input, slug: input.name !== before.name ? await uniqueSkillSlug(t, ctx, slugify(input.name), id) : before.slug, version: before.version + 1 })
      .where(eq(schema.skill.id, id))
      .returning();
    await recordEvent(t, ctx, { type: "skill.editada", entityType: "skill", entityId: id, summary: `Editó la skill «${input.name}» (v${before.version + 1})` });
    return row;
  });
}

export async function setSkillActive(ctx: Ctx, id: string, active: boolean) {
  assertCan(ctx, "manage", "agent");
  return getDb().transaction(async (t) => {
    const s = await getSkillRow(t, ctx, id);
    const [row] = await t.update(schema.skill).set({ active }).where(eq(schema.skill.id, id)).returning();
    await recordEvent(t, ctx, { type: "skill.editada", entityType: "skill", entityId: id, summary: `${active ? "Activó" : "Desactivó"} la skill «${s.name}»` });
    return row;
  });
}

export async function listSkills(ctx: Ctx, opts: { activeOnly?: boolean } = {}) {
  assertCan(ctx, "read", "agent");
  return getDb()
    .select()
    .from(schema.skill)
    .where(and(scoped(schema.skill, ctx), opts.activeOnly ? eq(schema.skill.active, true) : undefined))
    .orderBy(desc(schema.skill.active), asc(schema.skill.name));
}

export async function getSkill(ctx: Ctx, idOrSlug: string) {
  assertCan(ctx, "read", "agent");
  const isId = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const [s] = await getDb()
    .select()
    .from(schema.skill)
    .where(and(scoped(schema.skill, ctx), isId ? eq(schema.skill.id, idOrSlug) : eq(schema.skill.slug, idOrSlug)));
  return s ?? null;
}

/** SKILL.md con el formato de Claude Code (`.claude/skills/<slug>/SKILL.md`). */
export function skillMarkdown(s: { slug: string; name: string; description: string; instructionsMd: string; tools: string[] }) {
  const desc = s.description.replace(/\n+/g, " ").replace(/"/g, "'");
  return `---\nname: ${s.slug}\ndescription: "${desc}"\n---\n\n# ${s.name}\n\n${s.instructionsMd.trim()}\n${
    s.tools.length ? `\n## Herramientas de AGENCYOS (MCP)\n${s.tools.map((t) => `- \`${t}\``).join("\n")}\n` : ""
  }`;
}

// ---------- Objetivos ----------

export const goalInput = z.object({
  title: zRequired(200, "El objetivo"),
  descriptionMd: z.string().trim().max(20_000).optional().default(""),
  acceptanceMd: z.string().trim().max(10_000).optional().default(""),
  projectId: zOptUuid,
  clientId: zOptUuid,
  repo: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Repositorio como dueño/nombre")
      .optional(),
  ),
  skillIds: z.preprocess((v) => (typeof v === "string" ? (v ? v.split(",") : []) : v), z.array(z.string().uuid()).max(10).default([])),
  priority: z.coerce.number().int().min(1).max(4).default(3),
});

const stepInput = z.object({
  title: z.string().trim().min(2).max(300),
  kind: z.enum(STEP_KINDS).default("task"),
  detailMd: z.string().trim().max(10_000).optional(),
  requiresApproval: z.boolean().optional().default(false),
});
export const planInput = z.object({ steps: z.array(stepInput).min(1, "El plan necesita al menos un paso").max(40) });

async function getGoalRow(t: Tx, ctx: Ctx, id: string, lock = false) {
  const q = t
    .select()
    .from(schema.goal)
    .where(and(eq(schema.goal.id, id), scoped(schema.goal, ctx)));
  const [g] = await (lock ? q.for("update") : q);
  if (!g) throw notFound("El objetivo");
  return g;
}

async function logEvent(t: Tx, ctx: Ctx, goalId: string, kind: string, message: string, data: Record<string, unknown> = {}) {
  await t.insert(schema.goalEvent).values({
    workspaceId: ctx.workspaceId,
    goalId,
    actorType: ctx.actor.type,
    actorName: ctx.actor.name ?? null,
    kind,
    message: message.slice(0, 4000),
    data,
  });
  await t.update(schema.goal).set({ lastActivityAt: new Date() }).where(eq(schema.goal.id, goalId));
}

export async function createGoal(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "manage", "agent");
  const input = goalInput.parse(raw);
  return getDb().transaction(async (t) => {
    if (input.projectId) await assertOwned(t, ctx, schema.project, input.projectId, "El proyecto");
    if (input.clientId) await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
    if (input.skillIds.length) {
      const ok = await t
        .select({ id: schema.skill.id })
        .from(schema.skill)
        .where(and(scoped(schema.skill, ctx), inArray(schema.skill.id, input.skillIds)));
      if (ok.length !== new Set(input.skillIds).size) throw validation("Alguna skill no existe");
    }
    const [row] = await t
      .insert(schema.goal)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        title: input.title,
        descriptionMd: input.descriptionMd,
        acceptanceMd: input.acceptanceMd,
        projectId: input.projectId ?? null,
        clientId: input.clientId ?? null,
        repo: input.repo ?? null,
        skillIds: input.skillIds,
        priority: input.priority,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear el objetivo");
    await logEvent(t, ctx, row.id, "created", `Objetivo creado: ${row.title}`);
    await recordEvent(t, ctx, { type: "objetivo.creado", entityType: "goal", entityId: row.id, summary: `Creó el objetivo «${row.title}»` });
    return row;
  });
}

/** El agente (o vos) propone el plan: pasos con tipo y si necesitan tu OK. Queda esperando tu aprobación. */
export async function proposePlan(ctx: Ctx, goalId: string, raw: unknown) {
  assertCan(ctx, "update", "agent");
  const { steps } = planInput.parse(raw);
  return getDb().transaction(async (t) => {
    const g = await getGoalRow(t, ctx, goalId, true);
    if (!["draft", "planned", "running", "blocked"].includes(g.status))
      throw conflict(`El objetivo está «${GOAL_LABEL[g.status as keyof typeof GOAL_LABEL]}»: no se puede cambiar el plan.`);
    await t.delete(schema.goalStep).where(and(eq(schema.goalStep.goalId, goalId), eq(schema.goalStep.status, "pending")));
    const kept = await t.select({ idx: schema.goalStep.idx }).from(schema.goalStep).where(eq(schema.goalStep.goalId, goalId));
    const start = kept.length ? Math.max(...kept.map((k) => k.idx)) + 1 : 1;
    await t.insert(schema.goalStep).values(
      steps.map((s, i) => ({
        workspaceId: ctx.workspaceId,
        goalId,
        idx: start + i,
        title: s.title,
        kind: s.kind,
        detailMd: s.detailMd ?? null,
        // publicar siempre pide OK, lo diga o no el plan
        requiresApproval: s.requiresApproval || s.kind === "deploy",
      })),
    );
    const [row] = await t.update(schema.goal).set({ status: "planned" }).where(eq(schema.goal.id, goalId)).returning();
    await logEvent(t, ctx, goalId, "plan", `Plan propuesto con ${steps.length} pasos`, { steps: steps.map((s) => s.title) });
    await recordEvent(t, ctx, {
      type: "objetivo.plan_propuesto",
      entityType: "goal",
      entityId: goalId,
      summary: `${ctx.actor.name ?? "El agente"} propuso un plan de ${steps.length} pasos para «${g.title}»`,
    });
    return row;
  });
}

/** Aprobar el plan (solo una persona). Opcional: crear las tareas del plan en el proyecto. */
export async function approvePlan(ctx: Ctx, goalId: string, opts: { createTasks?: boolean } = {}) {
  assertCan(ctx, "manage", "agent");
  assertHuman(ctx, "Aprobar el plan");
  return getDb().transaction(async (t) => {
    const g = await getGoalRow(t, ctx, goalId, true);
    if (g.status !== "planned") throw conflict("No hay un plan esperando aprobación.");
    const steps = await t.select().from(schema.goalStep).where(eq(schema.goalStep.goalId, goalId)).orderBy(asc(schema.goalStep.idx));
    if (opts.createTasks && g.projectId) {
      const [p] = await t.select({ spaceId: schema.project.spaceId }).from(schema.project).where(eq(schema.project.id, g.projectId));
      for (const s of steps.filter((x) => x.status === "pending" && !x.taskId)) {
        const [task] = await t
          .insert(schema.task)
          .values({
            workspaceId: ctx.workspaceId,
            createdBy: ctx.userId,
            assigneeId: ctx.userId,
            assigneeType: "agent",
            title: `${s.title}`.slice(0, 300),
            descriptionMd: `Paso ${s.idx} del objetivo «${g.title}».${s.detailMd ? `\n\n${s.detailMd}` : ""}`,
            spaceId: p?.spaceId ?? (await t.select({ id: schema.space.id }).from(schema.space).where(scoped(schema.space, ctx)).limit(1))[0]?.id ?? "",
            projectId: g.projectId,
            priority: g.priority,
          })
          .returning();
        if (task) await t.update(schema.goalStep).set({ taskId: task.id }).where(eq(schema.goalStep.id, s.id));
      }
    }
    const [row] = await t.update(schema.goal).set({ status: "approved" }).where(eq(schema.goal.id, goalId)).returning();
    await logEvent(t, ctx, goalId, "approved", `Plan aprobado${opts.createTasks && g.projectId ? " (con tareas en el proyecto)" : ""}`);
    return row;
  });
}

export async function rejectPlan(ctx: Ctx, goalId: string, comment: string) {
  assertCan(ctx, "manage", "agent");
  assertHuman(ctx, "Rechazar el plan");
  const msg = z.string().trim().min(3, "Contale al agente qué cambiar").max(4000).parse(comment);
  return getDb().transaction(async (t) => {
    const g = await getGoalRow(t, ctx, goalId, true);
    if (g.status !== "planned") throw conflict("No hay un plan esperando aprobación.");
    const [row] = await t.update(schema.goal).set({ status: "draft" }).where(eq(schema.goal.id, goalId)).returning();
    await logEvent(t, ctx, goalId, "feedback", `Plan devuelto: ${msg}`);
    return row;
  });
}

/** El agente toma el objetivo para ejecutarlo (solo si el plan está aprobado o ya en ejecución). */
export async function claimGoal(ctx: Ctx, goalId: string) {
  assertCan(ctx, "update", "agent");
  return getDb().transaction(async (t) => {
    const g = await getGoalRow(t, ctx, goalId, true);
    if (!["approved", "running"].includes(g.status)) {
      throw conflict(
        g.status === "draft" || g.status === "planned"
          ? "Todavía no hay un plan aprobado: proponé el plan con proponer_plan y esperá la aprobación."
          : `El objetivo está «${GOAL_LABEL[g.status as keyof typeof GOAL_LABEL]}».`,
      );
    }
    const [row] = await t
      .update(schema.goal)
      .set({ status: "running", startedAt: g.startedAt ?? new Date(), executor: ctx.actor.name ?? ctx.actor.type })
      .where(eq(schema.goal.id, goalId))
      .returning();
    if (g.status === "approved") await logEvent(t, ctx, goalId, "claimed", `${ctx.actor.name ?? "El agente"} empezó a ejecutar el objetivo`);
    return row;
  });
}

export const stepUpdateInput = z.object({
  status: z.enum(["running", "done", "failed", "skipped"]),
  resultMd: z.string().trim().max(20_000).optional(),
});

/**
 * Avance de un paso. Un paso «con aprobación» no puede pasar a «en curso» sin tu OK: queda esperando y el
 * objetivo se bloquea (te llega una notificación). Un paso fallido cuenta el intento (para el ciclo de corregir).
 */
export async function updateStep(ctx: Ctx, goalId: string, idx: number, raw: unknown) {
  assertCan(ctx, "update", "agent");
  const input = stepUpdateInput.parse(raw);
  return getDb().transaction(async (t) => {
    const g = await getGoalRow(t, ctx, goalId, true);
    if (!["running", "approved", "blocked"].includes(g.status)) throw conflict("El objetivo no está en ejecución.");
    const [s] = await t
      .select()
      .from(schema.goalStep)
      .where(and(eq(schema.goalStep.goalId, goalId), eq(schema.goalStep.idx, idx)));
    if (!s) throw notFound(`El paso ${idx}`);
    if (s.requiresApproval && !s.approvedAt && input.status !== "skipped") {
      await t.update(schema.goalStep).set({ status: "waiting_approval" }).where(eq(schema.goalStep.id, s.id));
      await t.update(schema.goal).set({ status: "blocked" }).where(eq(schema.goal.id, goalId));
      await logEvent(t, ctx, goalId, "approval_request", `El paso ${idx} («${s.title}») necesita tu OK antes de hacerse.`, { idx });
      await recordEvent(t, ctx, {
        type: "objetivo.aprobacion_pedida",
        entityType: "goal",
        entityId: goalId,
        summary: `«${g.title}»: el paso «${s.title}» espera tu aprobación`,
      });
      return { step: { ...s, status: "waiting_approval" }, blocked: true };
    }
    const attempts = input.status === "failed" ? s.attempts + 1 : s.attempts;
    const [step] = await t
      .update(schema.goalStep)
      .set({ status: input.status, resultMd: input.resultMd ?? s.resultMd, attempts })
      .where(eq(schema.goalStep.id, s.id))
      .returning();
    if (g.status === "approved") await t.update(schema.goal).set({ status: "running", startedAt: new Date() }).where(eq(schema.goal.id, goalId));
    if (input.status === "done" && s.taskId) await t.update(schema.task).set({ status: "done", completedAt: new Date() }).where(eq(schema.task.id, s.taskId));
    const verb = { running: "Empezó", done: "Terminó", failed: "Falló", skipped: "Salteó" }[input.status];
    await logEvent(
      t,
      ctx,
      goalId,
      input.status === "failed" ? "error" : "step",
      `${verb} el paso ${idx}: ${s.title}${input.resultMd ? ` — ${input.resultMd.slice(0, 300)}` : ""}`,
      {
        idx,
        attempts,
      },
    );
    return { step, blocked: false };
  });
}

/** Aprobar o rechazar un paso que espera tu OK (solo una persona). */
export async function decideStep(ctx: Ctx, goalId: string, idx: number, approve: boolean) {
  assertCan(ctx, "manage", "agent");
  assertHuman(ctx, "Aprobar un paso");
  return getDb().transaction(async (t) => {
    const g = await getGoalRow(t, ctx, goalId, true);
    const [s] = await t
      .select()
      .from(schema.goalStep)
      .where(and(eq(schema.goalStep.goalId, goalId), eq(schema.goalStep.idx, idx)));
    if (!s) throw notFound(`El paso ${idx}`);
    if (s.status !== "waiting_approval") throw conflict("Ese paso no está esperando aprobación.");
    await t
      .update(schema.goalStep)
      .set(approve ? { approvedAt: new Date(), status: "pending" } : { status: "skipped", resultMd: "No aprobado" })
      .where(eq(schema.goalStep.id, s.id));
    const stillWaiting = await t
      .select({ id: schema.goalStep.id })
      .from(schema.goalStep)
      .where(and(eq(schema.goalStep.goalId, goalId), eq(schema.goalStep.status, "waiting_approval"), sql`${schema.goalStep.id} <> ${s.id}`));
    if (!stillWaiting.length && g.status === "blocked") await t.update(schema.goal).set({ status: "running" }).where(eq(schema.goal.id, goalId));
    await logEvent(t, ctx, goalId, "approval", `${approve ? "Aprobaste" : "No aprobaste"} el paso ${idx}: ${s.title}`, { idx, approve });
    return { approved: approve };
  });
}

/** Nota de avance, pregunta o corrección del agente (queda en la bitácora). */
export async function addGoalNote(ctx: Ctx, goalId: string, raw: { kind?: string; message: string }) {
  assertCan(ctx, "update", "agent");
  const kind = z.enum(["note", "question", "fix", "error"]).default("note").parse(raw.kind);
  const message = z.string().trim().min(1).max(4000).parse(raw.message);
  return getDb().transaction(async (t) => {
    await getGoalRow(t, ctx, goalId);
    await logEvent(t, ctx, goalId, kind, message);
    if (kind === "question")
      await recordEvent(t, ctx, { type: "objetivo.pregunta", entityType: "goal", entityId: goalId, summary: `Pregunta del agente: ${message.slice(0, 200)}` });
    return { ok: true };
  });
}

/** El agente termina: queda «para revisar» con el resumen y la evidencia (tests, PR, capturas). */
export async function finishGoal(ctx: Ctx, goalId: string, raw: { summaryMd: string; success?: boolean }) {
  assertCan(ctx, "update", "agent");
  const summary = z.string().trim().min(5, "Contá qué se hizo").max(20_000).parse(raw.summaryMd);
  return getDb().transaction(async (t) => {
    const g = await getGoalRow(t, ctx, goalId, true);
    if (!["running", "approved", "blocked"].includes(g.status)) throw conflict("El objetivo no está en ejecución.");
    const open = await t
      .select({ idx: schema.goalStep.idx })
      .from(schema.goalStep)
      .where(and(eq(schema.goalStep.goalId, goalId), inArray(schema.goalStep.status, ["pending", "running", "waiting_approval"])));
    if (raw.success !== false && open.length) throw conflict(`Faltan pasos: ${open.map((o) => o.idx).join(", ")}. Terminalos o marcálos como salteados.`);
    const status = raw.success === false ? "failed" : "review";
    const [row] = await t.update(schema.goal).set({ status, summaryMd: summary, finishedAt: new Date() }).where(eq(schema.goal.id, goalId)).returning();
    await logEvent(t, ctx, goalId, "finished", raw.success === false ? `No se pudo completar: ${summary.slice(0, 500)}` : "Terminado: queda para tu revisión");
    await recordEvent(t, ctx, {
      type: "objetivo.para_revisar",
      entityType: "goal",
      entityId: goalId,
      summary: raw.success === false ? `«${g.title}» no se pudo completar` : `«${g.title}» está listo para revisar`,
    });
    return row;
  });
}

/** Revisión final (solo una persona): aceptar lo cierra; devolver lo vuelve a ejecución con tus comentarios. */
export async function reviewGoal(ctx: Ctx, goalId: string, accept: boolean, comment = "") {
  assertCan(ctx, "manage", "agent");
  assertHuman(ctx, "La revisión");
  return getDb().transaction(async (t) => {
    const g = await getGoalRow(t, ctx, goalId, true);
    if (g.status !== "review" && g.status !== "failed") throw conflict("No hay nada para revisar.");
    if (!accept && comment.trim().length < 3) throw validation("Contale al agente qué corregir", { comment: "Obligatorio" });
    const [row] = await t
      .update(schema.goal)
      .set(accept ? { status: "done" } : { status: "running", finishedAt: null })
      .where(eq(schema.goal.id, goalId))
      .returning();
    await logEvent(
      t,
      ctx,
      goalId,
      accept ? "accepted" : "feedback",
      accept ? "Revisaste y aceptaste el resultado" : `Devuelto para corregir: ${comment.trim()}`,
    );
    if (accept && g.projectId)
      await t.insert(schema.changelogEntry).values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        projectId: g.projectId,
        kind: "release",
        title: `Objetivo cumplido: ${g.title}`,
        bodyMd: g.summaryMd,
      });
    return row;
  });
}

export async function cancelGoal(ctx: Ctx, goalId: string) {
  assertCan(ctx, "manage", "agent");
  assertHuman(ctx, "Cancelar");
  return getDb().transaction(async (t) => {
    const g = await getGoalRow(t, ctx, goalId, true);
    if (["done", "cancelled"].includes(g.status)) throw conflict("El objetivo ya está cerrado.");
    const [row] = await t.update(schema.goal).set({ status: "cancelled" }).where(eq(schema.goal.id, goalId)).returning();
    await logEvent(t, ctx, goalId, "cancelled", "Cancelaste el objetivo");
    return row;
  });
}

// ---------- Lecturas ----------

export async function listGoals(ctx: Ctx, opts: { status?: string[]; limit?: number } = {}) {
  assertCan(ctx, "read", "agent");
  return getDb()
    .select({
      g: schema.goal,
      projectName: schema.project.name,
      steps: sql<number>`(select count(*)::int from goal_step s where s.goal_id = ${schema.goal.id})`,
      stepsDone: sql<number>`(select count(*)::int from goal_step s where s.goal_id = ${schema.goal.id} and s.status in ('done','skipped'))`,
    })
    .from(schema.goal)
    .leftJoin(schema.project, eq(schema.project.id, schema.goal.projectId))
    .where(and(scoped(schema.goal, ctx), opts.status?.length ? inArray(schema.goal.status, opts.status) : undefined))
    .orderBy(
      sql`case ${schema.goal.status} when 'blocked' then 0 when 'planned' then 1 when 'review' then 2 when 'running' then 3 when 'approved' then 4 when 'draft' then 5 else 6 end`,
      desc(schema.goal.lastActivityAt),
    )
    .limit(opts.limit ?? 200);
}

export async function getGoal(ctx: Ctx, id: string) {
  assertCan(ctx, "read", "agent");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = getDb();
  const [row] = await db
    .select({ g: schema.goal, projectName: schema.project.name, clientName: schema.client.name })
    .from(schema.goal)
    .leftJoin(schema.project, eq(schema.project.id, schema.goal.projectId))
    .leftJoin(schema.client, eq(schema.client.id, schema.goal.clientId))
    .where(and(eq(schema.goal.id, id), scoped(schema.goal, ctx)));
  if (!row) return null;
  const [steps, events, skills] = await Promise.all([
    db.select().from(schema.goalStep).where(eq(schema.goalStep.goalId, id)).orderBy(asc(schema.goalStep.idx)),
    db.select().from(schema.goalEvent).where(eq(schema.goalEvent.goalId, id)).orderBy(desc(schema.goalEvent.at)).limit(200),
    row.g.skillIds.length
      ? db
          .select()
          .from(schema.skill)
          .where(and(scoped(schema.skill, ctx), inArray(schema.skill.id, row.g.skillIds)))
      : Promise.resolve([]),
  ]);
  return { ...row, steps, events, skills };
}

/**
 * Todo lo que el agente necesita para trabajar: objetivo, criterios, plan, skills con instrucciones, proyecto y
 * cliente, lo relacionado del Cerebro (decisiones y conversaciones) y lo último de la bitácora.
 */
export async function goalBriefing(ctx: Ctx, id: string) {
  const d = await getGoal(ctx, id);
  if (!d) throw notFound("El objetivo");
  const brain = await askBrain(ctx, `${d.g.title} ${d.projectName ?? ""} ${d.clientName ?? ""}`, { limit: 6 }).catch(() => null);
  return {
    id: d.g.id,
    objetivo: d.g.title,
    estado: GOAL_LABEL[d.g.status as keyof typeof GOAL_LABEL],
    descripcion: d.g.descriptionMd,
    criterios_de_aceptacion: d.g.acceptanceMd,
    proyecto: d.projectName,
    cliente: d.clientName,
    repositorio: d.g.repo,
    plan: d.steps.map((s) => ({
      paso: s.idx,
      titulo: s.title,
      tipo: KIND_LABEL[s.kind as keyof typeof KIND_LABEL],
      estado: STEP_LABEL[s.status as keyof typeof STEP_LABEL],
      necesita_aprobacion: s.requiresApproval && !s.approvedAt,
      detalle: s.detailMd,
      intentos: s.attempts,
      resultado: s.resultMd,
    })),
    skills: d.skills.map((s) => ({ nombre: s.name, instrucciones: s.instructionsMd, herramientas: s.tools })),
    contexto_del_cerebro: (brain?.hits ?? []).map((h) => ({ tipo: h.typeLabel, titulo: h.title, fecha: h.date, pasajes: h.excerpts })),
    bitacora_reciente: d.events.slice(0, 15).map((e) => ({ cuando: e.at.toISOString(), tipo: e.kind, mensaje: e.message })),
    reglas: [
      "Si el plan no está aprobado, proponelo con proponer_plan y esperá.",
      "Antes de cada paso: actualizar_paso(estado=running). Si el paso necesita aprobación, se bloquea hasta que Luciano apruebe.",
      "Escribí código en una rama, corré las pruebas; si fallan, registrá el error (actualizar_paso failed) y corregí antes de seguir.",
      "Nunca publiques, borres datos ni escribas a clientes sin un paso aprobado.",
      "Al terminar: terminar_objetivo con el resumen y la evidencia (pruebas, PR, capturas).",
    ],
  };
}

export async function controlSummary(ctx: Ctx) {
  assertCan(ctx, "read", "agent");
  const [goals] = await getDb()
    .select({
      active: sql<number>`count(*) filter (where ${schema.goal.status} in ('approved','running'))::int`,
      waiting: sql<number>`count(*) filter (where ${schema.goal.status} in ('planned','blocked','review'))::int`,
      done30: sql<number>`count(*) filter (where ${schema.goal.status} = 'done' and ${schema.goal.updatedAt} > now() - interval '30 days')::int`,
    })
    .from(schema.goal)
    .where(scoped(schema.goal, ctx));
  const [skills] = await getDb()
    .select({ n: sql<number>`count(*) filter (where ${schema.skill.active})::int` })
    .from(schema.skill)
    .where(scoped(schema.skill, ctx));
  return { goals: goals ?? { active: 0, waiting: 0, done30: 0 }, skills: skills?.n ?? 0, today: todayAR() };
}

export async function addSkillFromTemplate(ctx: Ctx, key: string) {
  const { findSkillTemplate } = await import("./templates");
  const t = findSkillTemplate(key);
  if (!t) throw notFound("La plantilla");
  return createSkill(ctx, { name: t.name, description: t.description, instructionsMd: t.instructionsMd, tools: t.tools, tags: t.tags });
}
