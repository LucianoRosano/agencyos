import { addMonths, assertCan, type Ctx, notFound, todayAR, toISODateAR, validation, zDate, zInt, zRequired } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, projectScope, scoped } from "../shared/db";

/** Elige una tarea como foco de hoy (máximo 3). */
export async function pickFocus(ctx: Ctx, taskId: string) {
  assertCan(ctx, "update", "task");
  if (!ctx.userId) throw validation("Sin usuario");
  const userId = ctx.userId;
  const today = todayAR();
  return getDb().transaction(async (t) => {
    const [task] = await t
      .select({ id: schema.task.id })
      .from(schema.task)
      .where(and(eq(schema.task.id, taskId), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)));
    if (!task) throw notFound("La tarea");
    const picks = await t
      .select()
      .from(schema.focusPick)
      .where(and(eq(schema.focusPick.userId, userId), eq(schema.focusPick.date, today)))
      .orderBy(asc(schema.focusPick.slot));
    if (picks.some((p) => p.taskId === taskId)) return picks;
    if (picks.length >= 3) throw validation("El foco de hoy admite hasta 3 tareas. Sacá una antes.");
    const used = new Set(picks.map((p) => p.slot));
    const slot = [1, 2, 3].find((s) => !used.has(s)) ?? 3;
    await t.insert(schema.focusPick).values({ workspaceId: ctx.workspaceId, userId, date: today, taskId, slot });
    return t
      .select()
      .from(schema.focusPick)
      .where(and(eq(schema.focusPick.userId, userId), eq(schema.focusPick.date, today)));
  });
}

export async function unpickFocus(ctx: Ctx, taskId: string) {
  if (!ctx.userId) throw validation("Sin usuario");
  await getDb()
    .delete(schema.focusPick)
    .where(
      and(
        eq(schema.focusPick.userId, ctx.userId),
        eq(schema.focusPick.date, todayAR()),
        eq(schema.focusPick.taskId, taskId),
        eq(schema.focusPick.workspaceId, ctx.workspaceId),
      ),
    );
}

// --- Recordatorios (renovaciones y vencimientos sueltos) ---
export const reminderInput = z.object({
  title: zRequired(200, "El título"),
  kind: z.enum(["domain", "hosting", "subscription", "certificate", "deadline", "other"]).default("other"),
  dueDate: zDate,
  notifyDaysBefore: zInt(0, 365).default(30),
  notesMd: z.string().max(5000).optional(),
  recurring: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(false),
});

export async function createReminder(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "reminder");
  const input = reminderInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .insert(schema.reminder)
      .values({ ...input, workspaceId: ctx.workspaceId, createdBy: ctx.userId })
      .returning();
    if (!row) throw new Error("No se pudo crear");
    await recordEvent(t, ctx, { type: "recordatorio.creado", entityType: "reminder", entityId: row.id, summary: `Agregó el vencimiento «${row.title}»` });
    return row;
  });
}

/** Marca hecho; si es anual recurrente, crea el del año siguiente. */
export async function completeReminder(ctx: Ctx, id: string) {
  assertCan(ctx, "update", "reminder");
  return getDb().transaction(async (t) => {
    const [r] = await t
      .update(schema.reminder)
      .set({ doneAt: new Date() })
      .where(and(eq(schema.reminder.id, id), scoped(schema.reminder, ctx)))
      .returning();
    if (!r) throw notFound("El vencimiento");
    if (r.recurring) {
      await t
        .insert(schema.reminder)
        .values({ ...r, id: undefined, doneAt: null, dueDate: addMonths(r.dueDate, 12), createdAt: undefined, updatedAt: undefined });
    }
    await recordEvent(t, ctx, { type: "recordatorio.hecho", entityType: "reminder", entityId: id, summary: `Resolvió «${r.title}»` });
    return r;
  });
}

export async function reopenReminder(ctx: Ctx, id: string) {
  const [r] = await getDb()
    .update(schema.reminder)
    .set({ doneAt: null })
    .where(and(eq(schema.reminder.id, id), scoped(schema.reminder, ctx)))
    .returning();
  return r;
}

export async function listReminders(ctx: Ctx) {
  return getDb().select().from(schema.reminder).where(scoped(schema.reminder, ctx)).orderBy(asc(schema.reminder.doneAt), asc(schema.reminder.dueDate));
}

// --- Preferencias de bloques de Hoy ---
export const TODAY_BLOCKS = ["foco", "ponerse", "proximos", "dinero", "facultad", "notas", "proyectos"] as const;
export type TodayBlock = (typeof TODAY_BLOCKS)[number];
export type TodayLayout = { order: TodayBlock[]; hidden: TodayBlock[] };

export async function getTodayLayout(userId: string): Promise<TodayLayout> {
  const [row] = await getDb()
    .select()
    .from(schema.userPreference)
    .where(and(eq(schema.userPreference.userId, userId), eq(schema.userPreference.key, "today_layout")));
  const v = (row?.value ?? {}) as Partial<TodayLayout>;
  const order = (v.order ?? []).filter((b): b is TodayBlock => (TODAY_BLOCKS as readonly string[]).includes(b));
  for (const b of TODAY_BLOCKS) if (!order.includes(b)) order.push(b);
  return { order, hidden: (v.hidden ?? []).filter((b): b is TodayBlock => (TODAY_BLOCKS as readonly string[]).includes(b)) };
}

export async function saveTodayLayout(userId: string, layout: TodayLayout) {
  await getDb()
    .insert(schema.userPreference)
    .values({ userId, key: "today_layout", value: layout })
    .onConflictDoUpdate({ target: [schema.userPreference.userId, schema.userPreference.key], set: { value: layout, updatedAt: new Date() } });
}

// --- Modo foco ---
export async function logFocusSession(ctx: Ctx, raw: unknown) {
  const input = z
    .object({ taskId: z.string().uuid().optional(), startedAt: z.coerce.date(), minutes: zInt(1, 600), notesMd: z.string().max(20000).optional() })
    .parse(raw);
  if (!ctx.userId) throw validation("Sin usuario");
  assertCan(ctx, "update", "task");
  return getDb().transaction(async (t) => {
    if (input.taskId) {
      const [own] = await t
        .select({ id: schema.task.id })
        .from(schema.task)
        .where(and(eq(schema.task.id, input.taskId), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)));
      if (!own) throw notFound("La tarea");
    }
    const [row] = await t
      .insert(schema.focusSession)
      .values({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId as string,
        taskId: input.taskId ?? null,
        startedAt: input.startedAt,
        endedAt: new Date(),
        minutes: input.minutes,
        notesMd: input.notesMd,
      })
      .returning();
    if (input.taskId) {
      if (input.notesMd?.trim()) {
        const [task] = await t
          .select()
          .from(schema.task)
          .where(and(eq(schema.task.id, input.taskId), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)));
        if (task)
          await t
            .update(schema.task)
            .set({ descriptionMd: `${task.descriptionMd ? `${task.descriptionMd}\n\n` : ""}**Sesión de foco (${input.minutes} min):**\n${input.notesMd}` })
            .where(eq(schema.task.id, task.id));
      }
      await recordEvent(t, ctx, { type: "foco.sesion", entityType: "task", entityId: input.taskId, summary: `Sesión de foco de ${input.minutes} min` });
    }
    return row;
  });
}

export async function focusMinutesToday(ctx: Ctx) {
  if (!ctx.userId) return 0;
  const rows = await getDb()
    .select({ m: schema.focusSession.minutes, s: schema.focusSession.startedAt })
    .from(schema.focusSession)
    .where(and(eq(schema.focusSession.userId, ctx.userId), eq(schema.focusSession.workspaceId, ctx.workspaceId)));
  const today = todayAR();
  return rows.filter((r) => toISODateAR(r.s) === today).reduce((a, r) => a + (r.m ?? 0), 0);
}
