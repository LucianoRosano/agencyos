import {
  addDays,
  assertCan,
  type Ctx,
  L,
  label,
  nextOccurrence,
  notFound,
  todayAR,
  validation,
  zDate,
  zInt,
  zOptDate,
  zOptText,
  zOptTime,
  zOptUuid,
  zRequired,
  zUuid,
} from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { type DbOrTx, schema } from "@agencyos/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { assertOwned, assertProjectAccess, getDb, projectScope, scoped } from "../shared/db";

export const TASK_STATUSES = ["todo", "doing", "waiting", "done", "cancelled"] as const;

export const taskInput = z.object({
  title: zRequired(300, "El título"),
  descriptionMd: zOptText(20000),
  spaceId: zOptUuid,
  projectId: zOptUuid,
  phaseId: zOptUuid,
  parentTaskId: zOptUuid,
  priority: zInt(1, 4).default(3),
  dueDate: zOptDate,
  dueTime: zOptTime,
  rrule: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(200).optional()),
  estimateMinutes: z.preprocess((v) => (v === "" ? undefined : v), zInt(1, 100000).optional()),
  status: z.enum(TASK_STATUSES).default("todo"),
  assigneeType: z.enum(["user", "agent", "client"]).default("user"),
});
export type TaskInput = z.input<typeof taskInput>;

async function touchProject(t: DbOrTx, projectId: string | null | undefined) {
  if (!projectId) return;
  await recalcProjectProgress(t, projectId);
}

/** Progreso = promedio por etapa de tareas completadas (etapas ponderadas por igual). */
export async function recalcProjectProgress(t: DbOrTx, projectId: string) {
  const rows = await t
    .select({
      phaseId: schema.task.phaseId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${schema.task.status} = 'done')::int`,
    })
    .from(schema.task)
    .where(
      and(
        eq(schema.task.projectId, projectId),
        sql`${schema.task.deletedAt} is null`,
        sql`${schema.task.status} <> 'cancelled'`,
        sql`${schema.task.parentTaskId} is null`,
      ),
    )
    .groupBy(schema.task.phaseId);
  const ratios = rows.filter((r) => r.total > 0).map((r) => r.done / r.total);
  const progress = ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) : 0;
  await t.update(schema.project).set({ progress, lastActivityAt: new Date() }).where(eq(schema.project.id, projectId));
}

async function resolveSpace(t: DbOrTx, ctx: Ctx, input: { spaceId?: string; projectId?: string; parentTaskId?: string }): Promise<string> {
  if (input.projectId) {
    const [p] = await t
      .select({ spaceId: schema.project.spaceId })
      .from(schema.project)
      .where(and(eq(schema.project.id, input.projectId), scoped(schema.project, ctx), projectScope(ctx)));
    if (!p) throw notFound("El proyecto");
    return p.spaceId;
  }
  if (input.parentTaskId) {
    const [p] = await t
      .select({ spaceId: schema.task.spaceId })
      .from(schema.task)
      .where(and(eq(schema.task.id, input.parentTaskId), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)));
    if (!p) throw notFound("La tarea padre");
    return p.spaceId;
  }
  if (input.spaceId) {
    await assertOwned(t, ctx, schema.space, input.spaceId, "El espacio");
    return input.spaceId;
  }
  const [s] = await t.select({ id: schema.space.id }).from(schema.space).where(scoped(schema.space, ctx)).orderBy(asc(schema.space.sort)).limit(1);
  if (!s) throw notFound("El espacio");
  return s.id;
}

/** La etapa debe ser del mismo workspace y del proyecto de la tarea. */
async function assertPhase(t: DbOrTx, ctx: Ctx, phaseId: string | null | undefined, projectId: string | null | undefined) {
  if (!phaseId) return;
  const [ph] = await t
    .select({ projectId: schema.projectPhase.projectId })
    .from(schema.projectPhase)
    .where(and(eq(schema.projectPhase.id, phaseId), scoped(schema.projectPhase, ctx)));
  if (!ph || ph.projectId !== projectId) throw validation("La etapa no pertenece al proyecto de la tarea", { phaseId: "Etapa inválida" });
}

export async function createTask(ctx: Ctx, raw: unknown, db: DbOrTx = getDb()) {
  assertCan(ctx, "create", "task");
  const input = taskInput.parse(raw);
  if (input.rrule && !input.dueDate) throw validation("Una tarea recurrente necesita fecha", { dueDate: "Elegí la primera fecha" });
  const run = async (t: DbOrTx) => {
    if (input.parentTaskId) {
      const [parent] = await t
        .select()
        .from(schema.task)
        .where(and(eq(schema.task.id, input.parentTaskId), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)));
      if (!parent) throw notFound("La tarea padre");
      if (parent.parentTaskId) throw validation("Las subtareas tienen un solo nivel");
      input.projectId = input.projectId ?? parent.projectId ?? undefined;
    }
    await assertProjectAccess(t, ctx, input.projectId);
    const spaceId = await resolveSpace(t, ctx, input);
    await assertPhase(t, ctx, input.phaseId, input.projectId);
    const [row] = await t
      .insert(schema.task)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        title: input.title,
        descriptionMd: input.descriptionMd,
        spaceId,
        projectId: input.projectId ?? null,
        phaseId: input.phaseId ?? null,
        parentTaskId: input.parentTaskId ?? null,
        priority: input.priority,
        dueDate: input.dueDate ?? null,
        dueTime: input.dueTime ?? null,
        rrule: input.rrule ?? null,
        estimateMinutes: input.estimateMinutes ?? null,
        status: input.status,
        assigneeType: ctx.actor.type === "agent" && input.assigneeType === "user" ? "user" : input.assigneeType,
        assigneeId: ctx.userId,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear la tarea");
    await recordEvent(t, ctx, {
      type: "tarea.creada",
      entityType: "task",
      entityId: row.id,
      summary: `Creó la tarea «${row.title}»`,
      payload: { projectId: row.projectId },
    });
    await touchProject(t, row.projectId);
    return row;
  };
  return db === getDb() ? getDb().transaction(run) : run(db);
}

export const taskPatch = taskInput.partial();

export async function updateTask(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "task");
  const patch = taskPatch.parse(raw);
  return getDb().transaction(async (t) => {
    const [before] = await t
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.id, id), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)));
    if (!before) throw notFound("La tarea");
    const values: Partial<typeof schema.task.$inferInsert> = {};
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
      if (patch[k] !== undefined) (values as Record<string, unknown>)[k] = patch[k];
    }
    // vaciar campos opcionales explícitamente
    const rawObj = (raw ?? {}) as Record<string, unknown>;
    for (const k of ["dueDate", "dueTime", "rrule", "phaseId", "descriptionMd", "estimateMinutes", "projectId"] as const) {
      if (k in rawObj && (rawObj[k] === "" || rawObj[k] === null)) (values as Record<string, unknown>)[k] = null;
    }
    if (values.parentTaskId !== undefined && values.parentTaskId !== null) {
      if (values.parentTaskId === id) throw validation("Una tarea no puede ser subtarea de sí misma");
      const [parent] = await t
        .select()
        .from(schema.task)
        .where(and(eq(schema.task.id, values.parentTaskId), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)));
      if (!parent) throw notFound("La tarea padre");
      if (parent.parentTaskId) throw validation("Las subtareas tienen un solo nivel");
      const [child] = await t
        .select({ id: schema.task.id })
        .from(schema.task)
        .where(and(eq(schema.task.parentTaskId, id), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)))
        .limit(1);
      if (child) throw validation("Una tarea con subtareas no puede ser subtarea");
    }
    if (values.projectId !== undefined) await assertProjectAccess(t, ctx, values.projectId);
    if (values.spaceId) await assertOwned(t, ctx, schema.space, values.spaceId, "El espacio");
    if (values.projectId) values.spaceId = await resolveSpace(t, ctx, { projectId: values.projectId });
    const nextProject = values.projectId === undefined ? before.projectId : values.projectId;
    if (values.phaseId) await assertPhase(t, ctx, values.phaseId, nextProject);
    else if (values.projectId !== undefined && values.projectId !== before.projectId) values.phaseId = null;
    const [row] = await t.update(schema.task).set(values).where(eq(schema.task.id, id)).returning();
    if (!row) throw notFound("La tarea");
    await recordEvent(t, ctx, { type: "tarea.actualizada", entityType: "task", entityId: id, summary: `Editó la tarea «${row.title}»` });
    await touchProject(t, row.projectId);
    if (before.projectId && before.projectId !== row.projectId) await touchProject(t, before.projectId);
    return row;
  });
}

/** Cambia el estado. Al completar una tarea recurrente se crea la siguiente ocurrencia. */
export async function setTaskStatus(ctx: Ctx, id: string, rawStatus: (typeof TASK_STATUSES)[number]) {
  assertCan(ctx, "update", "task");
  const status = z.enum(TASK_STATUSES).parse(rawStatus);
  return getDb().transaction(async (t) => {
    // FOR UPDATE: dos "completar" simultáneos no duplican la próxima ocurrencia.
    const [task] = await t
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.id, id), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)))
      .for("update");
    if (!task) throw notFound("La tarea");
    const [row] = await t
      .update(schema.task)
      .set({ status, completedAt: status === "done" ? new Date() : null })
      .where(eq(schema.task.id, id))
      .returning();
    if (!row) throw notFound("La tarea");
    let next: typeof row | null = null;
    if (status === "done" && task.status !== "done" && task.rrule && task.dueDate) {
      const nextDate = nextOccurrence(task.rrule, task.dueDate < todayAR() ? todayAR() : task.dueDate);
      const [n] = await t
        .insert(schema.task)
        .values({ ...task, id: undefined, status: "todo", completedAt: null, dueDate: nextDate, createdAt: undefined, updatedAt: undefined, snoozedFrom: null })
        .returning();
      next = n ?? null;
    }
    await recordEvent(t, ctx, {
      type: status === "done" ? "tarea.completada" : "tarea.estado_cambiado",
      entityType: "task",
      entityId: id,
      summary: status === "done" ? `Completó «${row.title}»` : `Pasó «${row.title}» a ${label(L.taskStatus, status).toLowerCase()}`,
      payload: { from: task.status, to: status },
    });
    await touchProject(t, row.projectId);
    return { task: row, next, previousStatus: task.status };
  });
}

/** Posponer: mueve la fecha N días (desde hoy si estaba vencida). */
export async function snoozeTask(ctx: Ctx, id: string, rawDays = 1) {
  assertCan(ctx, "update", "task");
  const days = zInt(1, 365).parse(rawDays);
  return getDb().transaction(async (t) => {
    const [task] = await t
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.id, id), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)));
    if (!task) throw notFound("La tarea");
    const base = !task.dueDate || task.dueDate < todayAR() ? todayAR() : task.dueDate;
    const due = addDays(base, days);
    const [row] = await t.update(schema.task).set({ dueDate: due, snoozedFrom: task.dueDate }).where(eq(schema.task.id, id)).returning();
    await recordEvent(t, ctx, {
      type: "tarea.pospuesta",
      entityType: "task",
      entityId: id,
      summary: `Pospuso «${task.title}»`,
      payload: { from: task.dueDate, to: due },
    });
    return { task: row, previousDue: task.dueDate };
  });
}

export async function setTaskDue(ctx: Ctx, id: string, rawDue: string | null) {
  assertCan(ctx, "update", "task");
  const due = rawDue === null ? null : zDate.parse(rawDue);
  const [row] = await getDb()
    .update(schema.task)
    .set({ dueDate: due })
    .where(and(eq(schema.task.id, id), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)))
    .returning();
  if (!row) throw notFound("La tarea");
  return row;
}

export async function convertTaskToProject(ctx: Ctx, id: string) {
  assertCan(ctx, "create", "project");
  return getDb().transaction(async (t) => {
    const [task] = await t
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.id, id), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)));
    if (!task) throw notFound("La tarea");
    const [p] = await t
      .insert(schema.project)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        name: task.title,
        spaceId: task.spaceId,
        goal: task.descriptionMd?.slice(0, 300),
        status: "planning",
        ownerId: ctx.userId,
      })
      .returning();
    if (!p) throw new Error("No se pudo crear el proyecto");
    await t.update(schema.task).set({ projectId: p.id, parentTaskId: null }).where(eq(schema.task.parentTaskId, id));
    await t.update(schema.task).set({ deletedAt: new Date() }).where(eq(schema.task.id, id));
    await recordEvent(t, ctx, { type: "proyecto.creado", entityType: "project", entityId: p.id, summary: `Convirtió la tarea «${task.title}» en proyecto` });
    return p;
  });
}

// --- checklist ---
/** Colaboradores: solo ítems de tareas de sus proyectos. */
function checklistScope(ctx: Ctx) {
  const scope = projectScope(ctx, schema.task.projectId);
  if (!scope) return undefined;
  return inArray(
    schema.taskChecklistItem.taskId,
    getDb()
      .select({ id: schema.task.id })
      .from(schema.task)
      .where(and(eq(schema.task.workspaceId, ctx.workspaceId), scope)),
  );
}

export async function addChecklistItem(ctx: Ctx, taskId: string, text: string) {
  assertCan(ctx, "update", "task");
  const parsed = zRequired(300, "El ítem").parse(text);
  const db = getDb();
  const [task] = await db
    .select({ id: schema.task.id })
    .from(schema.task)
    .where(and(eq(schema.task.id, taskId), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)));
  if (!task) throw notFound("La tarea");
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.taskChecklistItem)
    .where(eq(schema.taskChecklistItem.taskId, taskId));
  const [row] = await db.insert(schema.taskChecklistItem).values({ workspaceId: ctx.workspaceId, taskId, text: parsed, sort: n }).returning();
  return row;
}

export async function toggleChecklistItem(ctx: Ctx, itemId: string) {
  assertCan(ctx, "update", "task");
  const [row] = await getDb()
    .update(schema.taskChecklistItem)
    .set({ done: sql`not ${schema.taskChecklistItem.done}` })
    .where(and(eq(schema.taskChecklistItem.id, itemId), eq(schema.taskChecklistItem.workspaceId, ctx.workspaceId), checklistScope(ctx)))
    .returning();
  if (!row) throw notFound("El ítem");
  return row;
}

export async function removeChecklistItem(ctx: Ctx, itemId: string) {
  assertCan(ctx, "update", "task");
  await getDb()
    .delete(schema.taskChecklistItem)
    .where(and(eq(schema.taskChecklistItem.id, itemId), eq(schema.taskChecklistItem.workspaceId, ctx.workspaceId), checklistScope(ctx)));
}

export const zTaskId = zUuid;
