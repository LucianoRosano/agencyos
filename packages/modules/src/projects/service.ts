import { addDays, assertCan, type Ctx, L, label, notFound, todayAR, validation, zDate, zInt, zOptDate, zOptText, zOptUuid, zRequired } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema, type Tx } from "@agencyos/db";
import type { TemplateDefinition } from "@agencyos/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assertOwned, getDb, scoped } from "../shared/db";
import { recalcProjectProgress } from "../tasks/service";

export const PROJECT_STATUSES = ["idea", "planning", "in_progress", "paused", "blocked", "done", "archived"] as const;
export const PROJECT_KINDS = ["website", "store", "panel", "seo", "maintenance", "personal", "study", "other"] as const;

export const projectInput = z
  .object({
    name: zRequired(160, "El nombre"),
    spaceId: zOptUuid,
    clientId: zOptUuid,
    kind: z.enum(PROJECT_KINDS).default("other"),
    goal: zOptText(300),
    definitionOfDone: zOptText(2000),
    status: z.enum(PROJECT_STATUSES).default("planning"),
    priority: zInt(1, 4).default(3),
    startDate: zOptDate,
    targetDate: zOptDate,
    deliveredDate: zOptDate,
    nextAction: zOptText(300),
    notesMd: zOptText(50000),
  })
  .superRefine((v, c) => {
    if (v.status === "in_progress" && !v.nextAction?.trim()) c.addIssue({ code: "custom", path: ["nextAction"], message: "Un proyecto en curso necesita su siguiente acción" });
    if (v.startDate && v.targetDate && v.targetDate < v.startDate) c.addIssue({ code: "custom", path: ["targetDate"], message: "La fecha objetivo es anterior al inicio" });
  });

async function defaultSpace(t: Tx, ctx: Ctx, clientId?: string) {
  const spaces = await t.select().from(schema.space).where(scoped(schema.space, ctx)).orderBy(asc(schema.space.sort));
  const pick = (clientId ? spaces.find((s) => s.kind === "agency") : spaces.find((s) => s.kind === "personal")) ?? spaces[0];
  if (!pick) throw notFound("El espacio");
  return pick.id;
}

async function addChangelog(t: Tx, ctx: Ctx, projectId: string, title: string, kind: "auto" | "manual" | "release" = "auto", bodyMd?: string, version?: string) {
  await t.insert(schema.changelogEntry).values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, projectId, kind, title, bodyMd, version });
}

export async function createProject(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "project");
  const input = projectInput.parse(raw);
  return getDb().transaction(async (t) => {
    await assertOwned(t, ctx, schema.space, input.spaceId, "El espacio");
    await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
    const spaceId = input.spaceId ?? (await defaultSpace(t, ctx, input.clientId));
    const [row] = await t
      .insert(schema.project)
      .values({ ...input, spaceId, clientId: input.clientId ?? null, workspaceId: ctx.workspaceId, createdBy: ctx.userId, ownerId: ctx.userId })
      .returning();
    if (!row) throw new Error("No se pudo crear el proyecto");
    await addChangelog(t, ctx, row.id, "Proyecto creado");
    await recordEvent(t, ctx, { type: "proyecto.creado", entityType: "project", entityId: row.id, summary: `Creó el proyecto «${row.name}»` });
    return row;
  });
}

export const wizardInput = z.object({
  templateId: z.string().uuid("Elegí una plantilla"),
  name: zRequired(160, "El nombre"),
  clientId: zOptUuid,
  spaceId: zOptUuid,
  definitionOfDone: zRequired(2000, "La definición de terminado"),
  targetDate: zOptDate,
  firstAction: zRequired(300, "La primera acción"),
  startDate: zOptDate,
  quoteId: zOptUuid,
});

/** Asistente de arranque: plantilla → etapas, tareas fechadas, checklist, nota inicial y primera acción en Hoy. */
export async function createFromTemplate(ctx: Ctx, raw: unknown, outer?: Tx) {
  assertCan(ctx, "create", "project");
  const input = wizardInput.parse(raw);
  const run = async (t: Tx) => {
    const [tpl] = await t.select().from(schema.projectTemplate).where(and(eq(schema.projectTemplate.id, input.templateId), scoped(schema.projectTemplate, ctx)));
    if (!tpl) throw notFound("La plantilla");
    await assertOwned(t, ctx, schema.space, input.spaceId, "El espacio");
    await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
    await assertOwned(t, ctx, schema.quote, input.quoteId, "El presupuesto");
    const start = input.startDate ?? todayAR();
    const spaceId = input.spaceId ?? (await defaultSpace(t, ctx, input.clientId));
    const def = tpl.definition as TemplateDefinition;
    const checklistMd = def.checklist?.length ? `\n\n## Checklist\n${def.checklist.map((c) => `- [ ] ${c}`).join("\n")}` : "";
    const questionsMd = def.clientQuestions?.length ? `\n\n## Preguntas al cliente\n${def.clientQuestions.map((q) => `- ${q}`).join("\n")}` : "";
    const [p] = await t
      .insert(schema.project)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        ownerId: ctx.userId,
        name: input.name,
        spaceId,
        clientId: input.clientId ?? null,
        kind: tpl.kind,
        definitionOfDone: input.definitionOfDone,
        status: "in_progress",
        startDate: start,
        targetDate: input.targetDate ?? null,
        nextAction: input.firstAction,
        templateId: tpl.id,
        quoteId: input.quoteId ?? null,
        notesMd: `${def.initialNote ?? ""}${questionsMd}${checklistMd}`.trim() || null,
      })
      .returning();
    if (!p) throw new Error("No se pudo crear el proyecto");
    let firstPhaseId: string | null = null;
    for (const [i, ph] of def.phases.entries()) {
      const lastOffset = Math.max(0, ...ph.tasks.map((x) => x.offsetDays ?? 0));
      const [phase] = await t
        .insert(schema.projectPhase)
        .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, projectId: p.id, name: ph.name, sort: i, status: i === 0 ? "in_progress" : "pending", dueDate: addDays(start, lastOffset) })
        .returning();
      if (i === 0) firstPhaseId = phase?.id ?? null;
      if (phase && ph.tasks.length) {
        await t.insert(schema.task).values(
          ph.tasks.map((task, k) => ({
            workspaceId: ctx.workspaceId,
            createdBy: ctx.userId,
            assigneeId: ctx.userId,
            title: task.title,
            spaceId,
            projectId: p.id,
            phaseId: phase.id,
            priority: task.priority ?? 3,
            dueDate: addDays(start, task.offsetDays ?? 0),
            sort: k,
          })),
        );
      }
    }
    // La primera acción es una tarea para hoy: aparece en "Hoy".
    await t.insert(schema.task).values({
      workspaceId: ctx.workspaceId,
      createdBy: ctx.userId,
      assigneeId: ctx.userId,
      title: input.firstAction,
      spaceId,
      projectId: p.id,
      phaseId: firstPhaseId,
      priority: 2,
      dueDate: todayAR(),
      sort: -1,
    });
    await addChangelog(t, ctx, p.id, `Proyecto creado con la plantilla «${tpl.name}»`);
    await recordEvent(t, ctx, { type: "proyecto.creado", entityType: "project", entityId: p.id, summary: `Arrancó el proyecto «${p.name}» (${tpl.name})`, payload: { templateId: tpl.id } });
    await recalcProjectProgress(t, p.id);
    return p;
  };
  return outer ? run(outer) : getDb().transaction(run);
}

export async function updateProject(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = projectInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [before] = await t.select().from(schema.project).where(and(eq(schema.project.id, id), scoped(schema.project, ctx)));
    if (!before) throw notFound("El proyecto");
    await assertOwned(t, ctx, schema.space, input.spaceId, "El espacio");
    await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
    const [row] = await t
      .update(schema.project)
      .set({
        ...input,
        spaceId: input.spaceId ?? before.spaceId,
        clientId: input.clientId ?? null,
        goal: input.goal ?? null,
        definitionOfDone: input.definitionOfDone ?? null,
        startDate: input.startDate ?? null,
        targetDate: input.targetDate ?? null,
        deliveredDate: input.deliveredDate ?? (input.status === "done" ? before.deliveredDate ?? todayAR() : null),
        nextAction: input.nextAction ?? null,
        notesMd: input.notesMd ?? null,
        lastActivityAt: new Date(),
      })
      .where(eq(schema.project.id, id))
      .returning();
    if (!row) throw notFound("El proyecto");
    const changes: string[] = [];
    if (before.status !== row.status) changes.push(`estado: ${label(L.projectStatus, before.status)} → ${label(L.projectStatus, row.status)}`);
    if (before.targetDate !== row.targetDate) changes.push(`fecha objetivo: ${row.targetDate ?? "sin fecha"}`);
    if (before.definitionOfDone !== row.definitionOfDone) changes.push("definición de terminado actualizada");
    if (changes.length) await addChangelog(t, ctx, id, changes.join(" · "));
    await recordEvent(t, ctx, {
      type: before.status !== row.status ? "proyecto.estado_cambiado" : "proyecto.actualizado",
      entityType: "project",
      entityId: id,
      summary: before.status !== row.status ? `Pasó «${row.name}» a ${label(L.projectStatus, row.status).toLowerCase()}` : `Editó el proyecto «${row.name}»`,
    });
    return row;
  });
}

export async function setNextAction(ctx: Ctx, id: string, nextAction: string, alsoTask = true) {
  assertCan(ctx, "update", "project");
  const text = zRequired(300, "La siguiente acción").parse(nextAction);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.project)
      .set({ nextAction: text, lastActivityAt: new Date() })
      .where(and(eq(schema.project.id, id), scoped(schema.project, ctx)))
      .returning();
    if (!row) throw notFound("El proyecto");
    if (alsoTask) {
      await t.insert(schema.task).values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, assigneeId: ctx.userId, title: text, spaceId: row.spaceId, projectId: id, priority: 2, dueDate: todayAR() });
    }
    await recordEvent(t, ctx, { type: "proyecto.siguiente_accion", entityType: "project", entityId: id, summary: `Definió la siguiente acción de «${row.name}»: ${text}` });
    return row;
  });
}

export async function setProjectStatus(ctx: Ctx, id: string, rawStatus: (typeof PROJECT_STATUSES)[number]) {
  assertCan(ctx, "update", "project");
  const status = z.enum(PROJECT_STATUSES).parse(rawStatus);
  return getDb().transaction(async (t) => {
    const [p] = await t.select().from(schema.project).where(and(eq(schema.project.id, id), scoped(schema.project, ctx)));
    if (!p) throw notFound("El proyecto");
    if (status === "in_progress" && !p.nextAction?.trim()) throw validation("Definí la siguiente acción antes de pasarlo a «En curso»", { nextAction: "Obligatoria" });
    const [row] = await t
      .update(schema.project)
      .set({ status, lastActivityAt: new Date(), deliveredDate: status === "done" ? p.deliveredDate ?? todayAR() : p.deliveredDate })
      .where(eq(schema.project.id, id))
      .returning();
    await addChangelog(t, ctx, id, `Estado: ${label(L.projectStatus, p.status)} → ${label(L.projectStatus, status)}`);
    await recordEvent(t, ctx, { type: "proyecto.estado_cambiado", entityType: "project", entityId: id, summary: `Pasó «${p.name}» a ${label(L.projectStatus, status).toLowerCase()}`, payload: { from: p.status, to: status } });
    return row;
  });
}

// --- Etapas ---
export async function addPhase(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = z.object({ name: zRequired(120, "El nombre"), dueDate: zOptDate }).parse(raw);
  return getDb().transaction(async (t) => {
    await assertOwned(t, ctx, schema.project, projectId, "El proyecto");
    const [{ n } = { n: 0 }] = await t.select({ n: sql<number>`count(*)::int` }).from(schema.projectPhase).where(and(eq(schema.projectPhase.projectId, projectId), scoped(schema.projectPhase, ctx)));
    const [row] = await t.insert(schema.projectPhase).values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, projectId, name: input.name, dueDate: input.dueDate ?? null, sort: n }).returning();
    return row;
  });
}

export async function setPhaseStatus(ctx: Ctx, phaseId: string, rawStatus: "pending" | "in_progress" | "done") {
  assertCan(ctx, "update", "project");
  const status = z.enum(["pending", "in_progress", "done"]).parse(rawStatus);
  return getDb().transaction(async (t) => {
    const [row] = await t.update(schema.projectPhase).set({ status }).where(and(eq(schema.projectPhase.id, phaseId), scoped(schema.projectPhase, ctx))).returning();
    if (!row) throw notFound("La etapa");
    await addChangelog(t, ctx, row.projectId, `Etapa «${row.name}»: ${label(L.phaseStatus, status).toLowerCase()}`);
    await recordEvent(t, ctx, { type: "proyecto.etapa_cambiada", entityType: "project", entityId: row.projectId, summary: `Etapa «${row.name}» → ${label(L.phaseStatus, status).toLowerCase()}` });
    return row;
  });
}

// --- Bloqueos ---
export async function addBlocker(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = z.object({ waitingFor: zRequired(200, "A quién o qué esperás"), revisitOn: zOptDate }).parse(raw);
  return getDb().transaction(async (t) => {
    const [p] = await t.select().from(schema.project).where(and(eq(schema.project.id, projectId), scoped(schema.project, ctx)));
    if (!p) throw notFound("El proyecto");
    const [row] = await t.insert(schema.blocker).values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, projectId, waitingFor: input.waitingFor, revisitOn: input.revisitOn ?? addDays(todayAR(), 3) }).returning();
    await recordEvent(t, ctx, { type: "proyecto.bloqueado", entityType: "project", entityId: projectId, summary: `«${p.name}» espera a: ${input.waitingFor}` });
    return row;
  });
}

export async function resolveBlocker(ctx: Ctx, blockerId: string) {
  assertCan(ctx, "update", "project");
  const [row] = await getDb().update(schema.blocker).set({ resolvedAt: new Date() }).where(and(eq(schema.blocker.id, blockerId), scoped(schema.blocker, ctx))).returning();
  if (!row) throw notFound("El bloqueo");
  return row;
}

export async function postponeBlocker(ctx: Ctx, blockerId: string, rawDays = 3) {
  assertCan(ctx, "update", "project");
  const days = zInt(1, 365).parse(rawDays);
  const [row] = await getDb().update(schema.blocker).set({ revisitOn: addDays(todayAR(), days) }).where(and(eq(schema.blocker.id, blockerId), scoped(schema.blocker, ctx))).returning();
  if (!row) throw notFound("El bloqueo");
  return row;
}

// --- Decisiones ---
export const decisionInput = z.object({
  title: zRequired(200, "La decisión"),
  rationaleMd: zOptText(10000),
  decidedOn: zDate.optional(),
  approvedBy: zOptText(120),
});

export async function addDecision(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = decisionInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [p] = await t.select().from(schema.project).where(and(eq(schema.project.id, projectId), scoped(schema.project, ctx)));
    if (!p) throw notFound("El proyecto");
    const [row] = await t
      .insert(schema.decision)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, projectId, title: input.title, rationaleMd: input.rationaleMd, decidedOn: input.decidedOn ?? todayAR(), approvedBy: input.approvedBy ?? ctx.actor.name })
      .returning();
    await t.update(schema.project).set({ lastActivityAt: new Date() }).where(eq(schema.project.id, projectId));
    await recordEvent(t, ctx, { type: "decision.registrada", entityType: "project", entityId: projectId, summary: `Registró la decisión «${input.title}» en «${p.name}»` });
    return row;
  });
}

// --- Entregas ---
export async function addDeliverable(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = z.object({ title: zRequired(200, "El título"), dueDate: zOptDate, contentMd: zOptText(5000) }).parse(raw);
  return getDb().transaction(async (t) => {
    await assertOwned(t, ctx, schema.project, projectId, "El proyecto");
    const [row] = await t.insert(schema.deliverable).values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, projectId, ...input }).returning();
    await recordEvent(t, ctx, { type: "entrega.creada", entityType: "project", entityId: projectId, summary: `Agregó la entrega «${input.title}»` });
    return row;
  });
}

export async function setDeliverableStatus(ctx: Ctx, id: string, rawStatus: "pending" | "delivered" | "approved" | "changes_requested") {
  assertCan(ctx, "update", "project");
  const status = z.enum(["pending", "delivered", "approved", "changes_requested"]).parse(rawStatus);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.deliverable)
      .set({ status, approvedAt: status === "approved" ? new Date() : null })
      .where(and(eq(schema.deliverable.id, id), scoped(schema.deliverable, ctx)))
      .returning();
    if (!row) throw notFound("La entrega");
    await addChangelog(t, ctx, row.projectId, `Entrega «${row.title}»: ${label(L.deliverableStatus, status).toLowerCase()}`, status === "approved" ? "release" : "auto");
    await recordEvent(t, ctx, { type: status === "approved" ? "entrega.aprobada" : "entrega.estado_cambiado", entityType: "project", entityId: row.projectId, summary: `Entrega «${row.title}» → ${label(L.deliverableStatus, status).toLowerCase()}` });
    return row;
  });
}

export async function addChangelogEntry(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = z.object({ title: zRequired(200, "El título"), bodyMd: zOptText(10000), version: zOptText(30) }).parse(raw);
  return getDb().transaction(async (t) => {
    await assertOwned(t, ctx, schema.project, projectId, "El proyecto");
    await addChangelog(t, ctx, projectId, input.title, input.version ? "release" : "manual", input.bodyMd, input.version);
    await recordEvent(t, ctx, { type: "proyecto.changelog", entityType: "project", entityId: projectId, summary: `Agregó al changelog: ${input.title}` });
  });
}

/** Guarda la estructura actual (etapas + tareas con desfases relativos) como plantilla. */
export async function saveAsTemplate(ctx: Ctx, projectId: string, name: string) {
  assertCan(ctx, "create", "project");
  const tplName = zRequired(120, "El nombre").parse(name);
  const db = getDb();
  const [p] = await db.select().from(schema.project).where(and(eq(schema.project.id, projectId), scoped(schema.project, ctx)));
  if (!p) throw notFound("El proyecto");
  const phases = await db.select().from(schema.projectPhase).where(and(eq(schema.projectPhase.projectId, projectId), scoped(schema.projectPhase, ctx))).orderBy(asc(schema.projectPhase.sort));
  const tasks = await db.select().from(schema.task).where(and(eq(schema.task.projectId, projectId), scoped(schema.task, ctx))).orderBy(asc(schema.task.sort));
  const start = p.startDate ?? todayAR();
  const off = (d: string | null) => (d ? Math.max(0, Math.round((Date.parse(d) - Date.parse(start)) / 86_400_000)) : 0);
  const definition: TemplateDefinition = {
    phases: phases.map((ph) => ({
      name: ph.name,
      tasks: tasks.filter((t) => t.phaseId === ph.id && !t.parentTaskId).map((t) => ({ title: t.title, offsetDays: off(t.dueDate), priority: t.priority })),
    })),
    initialNote: p.notesMd ?? undefined,
  };
  const [row] = await db.insert(schema.projectTemplate).values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, name: tplName, kind: p.kind, description: `Basada en «${p.name}»`, definition, sort: 100 }).returning();
  return row;
}

export const projectStatusLabel = (s: string) => label(L.projectStatus, s);
