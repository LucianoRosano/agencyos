import { assertCan, type Ctx, notFound, todayAR, validation, zBool, zCurrency, zDate, zOptMoney, zOptText, zOptUuid } from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { schema, type Tx } from "@agencyos/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assertOwned, getDb, scoped } from "../shared/db";
import { formatMinutes, parseDuration } from "./duration";

/** "25.000" (miles con punto, sin coma decimal) → "25000"; el resto lo resuelve zOptMoney. */
const thousandsDots = (v: unknown) => (typeof v === "string" && /^\s*\d{1,3}(\.\d{3})+\s*$/.test(v) ? v.replace(/\./g, "") : v);
const zRate = z.preprocess(thousandsDots, zOptMoney);

/** Máximo por registro: un día entero. */
export const MAX_ENTRY_MINUTES = 24 * 60;

const zDuration = z.preprocess(
  (v) => (v === undefined || v === null || v === "" ? undefined : (parseDuration(v) ?? Number.NaN)),
  z
    .number({ error: "Indicá la duración (p. ej. 90, 1h30 o 1:30)" })
    .refine((n) => !Number.isNaN(n), "No entendí la duración. Probá con 90, 1h30 o 1:30")
    .refine((n) => n >= 1, "La duración mínima es 1 minuto")
    .refine((n) => n <= MAX_ENTRY_MINUTES, "Máximo 24 h por registro"),
);

export const timeEntryInput = z
  .object({
    projectId: zOptUuid,
    taskId: zOptUuid,
    date: z.preprocess((v) => (v === "" || v === undefined ? todayAR() : v), zDate),
    duration: zDuration,
    billable: zBool,
    rate: zRate,
    currency: zCurrency.default("ARS"),
    note: zOptText(500),
  })
  .superRefine((v, c) => {
    if (!v.projectId && !v.taskId) c.addIssue({ code: "custom", path: ["projectId"], message: "Elegí un proyecto o una tarea" });
    if (v.date > todayAR()) c.addIssue({ code: "custom", path: ["date"], message: "No se registran horas a futuro" });
  });

/** Resuelve proyecto y tarea verificando que sean del workspace; la tarea manda su proyecto. */
async function resolveTarget(t: Tx, ctx: Ctx, projectId?: string, taskId?: string) {
  await assertOwned(t, ctx, schema.project, projectId, "El proyecto");
  if (!taskId) return { projectId: projectId ?? null, taskId: null, title: null as string | null };
  const [task] = await t
    .select({ id: schema.task.id, projectId: schema.task.projectId, title: schema.task.title })
    .from(schema.task)
    .where(and(eq(schema.task.id, taskId), scoped(schema.task, ctx, { withArchived: true })));
  if (!task) throw notFound("La tarea");
  if (projectId && task.projectId && task.projectId !== projectId)
    throw validation("La tarea es de otro proyecto", { taskId: "Elegí una tarea de este proyecto" });
  return { projectId: task.projectId ?? projectId ?? null, taskId: task.id, title: task.title };
}

async function entityLabel(t: Tx, ctx: Ctx, projectId: string | null, taskTitle: string | null) {
  if (taskTitle) return `«${taskTitle}»`;
  if (!projectId) return "";
  const [p] = await t
    .select({ name: schema.project.name })
    .from(schema.project)
    .where(and(eq(schema.project.id, projectId), eq(schema.project.workspaceId, ctx.workspaceId)));
  return p ? `«${p.name}»` : "";
}

export async function createTimeEntry(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = timeEntryInput.parse(raw);
  if (!ctx.userId) throw validation("Sin usuario");
  return getDb().transaction(async (t) => {
    const target = await resolveTarget(t, ctx, input.projectId, input.taskId);
    const [row] = await t
      .insert(schema.timeEntry)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        userId: ctx.userId as string,
        projectId: target.projectId,
        taskId: target.taskId,
        minutes: input.duration,
        date: input.date,
        billable: input.billable,
        rate: input.rate ?? null,
        currency: input.currency,
        note: input.note ?? null,
      })
      .returning();
    if (!row) throw new Error("No se pudo registrar el tiempo");
    const what = await entityLabel(t, ctx, target.projectId, target.title);
    await recordEvent(t, ctx, {
      type: "tiempo.registrado",
      entityType: target.taskId ? "task" : "project",
      entityId: target.taskId ?? target.projectId ?? undefined,
      summary: `Registró ${formatMinutes(row.minutes)}${what ? ` en ${what}` : ""}`,
      payload: { timeEntryId: row.id, minutes: row.minutes, projectId: target.projectId },
    });
    return row;
  });
}

export async function updateTimeEntry(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = timeEntryInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [before] = await t
      .select()
      .from(schema.timeEntry)
      .where(and(eq(schema.timeEntry.id, id), scoped(schema.timeEntry, ctx)));
    if (!before) throw notFound("El registro de tiempo");
    const target = await resolveTarget(t, ctx, input.projectId, input.taskId);
    const [row] = await t
      .update(schema.timeEntry)
      .set({
        projectId: target.projectId,
        taskId: target.taskId,
        minutes: input.duration,
        date: input.date,
        billable: input.billable,
        rate: input.rate ?? null,
        currency: input.currency,
        note: input.note ?? null,
      })
      .where(eq(schema.timeEntry.id, id))
      .returning();
    if (!row) throw notFound("El registro de tiempo");
    await recordEvent(t, ctx, {
      type: "tiempo.editado",
      entityType: target.taskId ? "task" : "project",
      entityId: target.taskId ?? target.projectId ?? undefined,
      summary: `Editó un registro de tiempo (${formatMinutes(before.minutes)} → ${formatMinutes(row.minutes)})`,
      payload: { timeEntryId: row.id },
    });
    return row;
  });
}

/**
 * Registro automático desde el Modo foco (dentro de la transacción de la sesión).
 * Facturable si la tarea pertenece a un proyecto con cliente.
 */
export async function recordFocusTimeInTx(t: Tx, ctx: Ctx, input: { taskId: string; minutes: number; date: string; note?: string }) {
  if (!ctx.userId) return null;
  const [task] = await t
    .select({ projectId: schema.task.projectId, clientId: schema.project.clientId })
    .from(schema.task)
    .leftJoin(schema.project, eq(schema.project.id, schema.task.projectId))
    .where(and(eq(schema.task.id, input.taskId), scoped(schema.task, ctx, { withArchived: true })));
  if (!task) return null;
  const [row] = await t
    .insert(schema.timeEntry)
    .values({
      workspaceId: ctx.workspaceId,
      createdBy: ctx.userId,
      userId: ctx.userId,
      projectId: task.projectId,
      taskId: input.taskId,
      minutes: Math.min(Math.max(1, Math.round(input.minutes)), MAX_ENTRY_MINUTES),
      date: input.date,
      billable: Boolean(task.clientId),
      note: input.note ?? "Sesión de foco",
    })
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Tarifa objetivo (workspace.settings, sin columnas nuevas)
// ---------------------------------------------------------------------------

export type HourlyTarget = { targetHourlyRate?: string; targetHourlyCurrency?: string };

export const targetRateInput = z.object({
  targetHourlyRate: zRate,
  targetHourlyCurrency: zCurrency.default("ARS"),
});

export async function setTargetHourlyRate(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "manage", "settings");
  const input = targetRateInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [before] = await t.select().from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId));
    if (!before) throw notFound("El workspace");
    const settings: Record<string, unknown> = { ...before.settings };
    if (input.targetHourlyRate && input.targetHourlyRate !== "0.00") {
      settings.targetHourlyRate = input.targetHourlyRate;
      settings.targetHourlyCurrency = input.targetHourlyCurrency;
    } else {
      delete settings.targetHourlyRate;
      delete settings.targetHourlyCurrency;
    }
    const [row] = await t
      .update(schema.workspace)
      .set({ settings: settings as typeof before.settings, updatedAt: new Date() })
      .where(eq(schema.workspace.id, ctx.workspaceId))
      .returning();
    await audit(t, ctx, {
      action: "workspace.target_rate_updated",
      targetType: "workspace",
      targetId: ctx.workspaceId,
      before: { targetHourlyRate: (before.settings as HourlyTarget).targetHourlyRate ?? null },
      after: { targetHourlyRate: settings.targetHourlyRate ?? null, targetHourlyCurrency: settings.targetHourlyCurrency ?? null },
    });
    return { targetHourlyRate: (settings.targetHourlyRate as string | undefined) ?? null, workspaceId: row?.id };
  });
}
