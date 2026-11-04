import {
  addDays,
  assertCan,
  type Ctx,
  diffDays,
  formatDate,
  L,
  label,
  notFound,
  todayAR,
  validation,
  zDate,
  zOptDate,
  zOptText,
  zOptTime,
  zOptUuid,
  zRequired,
} from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema, type Tx } from "@agencyos/db";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { assertOwned, getDb, scoped } from "../shared/db";
import { createTask } from "../tasks/service";

export const COURSE_STATUSES = ["cursando", "regular", "aprobada", "final_pendiente", "abandonada"] as const;
export const ASSESSMENT_KINDS = ["parcial", "tp", "final", "recuperatorio", "otro"] as const;
/** Paleta sugerida para materias (siempre acompañada del nombre, nunca solo color). */
export const COURSE_COLORS = ["#FBBF24", "#22D3EE", "#7C5CFF", "#34D399", "#F472B6", "#60A5FA", "#FB923C", "#A78BFA"] as const;

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Nota de 0 a 10 con hasta 2 decimales; acepta coma decimal. Se guarda como string ("7.50"). */
export const zGrade = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().replace(",", ".") : typeof v === "number" ? String(v) : v),
  z
    .string()
    .regex(/^\d{1,2}(\.\d{1,2})?$/, "Nota inválida (de 0 a 10)")
    .refine((v) => Number(v) >= 0 && Number(v) <= 10, "La nota va de 0 a 10")
    .transform((v) => Number(v).toFixed(2)),
);
export const zOptGrade = z.preprocess(emptyToUndef, zGrade.optional());

const zColor = z.preprocess(
  emptyToUndef,
  z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
    .optional(),
);

const scheduleSlot = z
  .object({
    day: z.coerce.number().int().min(0, "Día inválido").max(6, "Día inválido"),
    from: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida"),
    to: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida"),
    room: z.preprocess(emptyToUndef, z.string().trim().max(80).optional()),
  })
  .refine((s) => s.to > s.from, { message: "El horario termina antes de empezar", path: ["to"] });
export type ScheduleSlot = z.infer<typeof scheduleSlot>;

/** Horarios: llegan como JSON (desde el formulario) o como arreglo. */
const zSchedule = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === "") return [];
    if (typeof v === "string") {
      try {
        return JSON.parse(v);
      } catch {
        return "invalid";
      }
    }
    return v;
  },
  z.array(scheduleSlot, { error: "Horarios inválidos" }).max(14, "Máximo 14 horarios"),
);

export const courseInput = z.object({
  name: zRequired(160, "El nombre"),
  program: zOptText(160),
  term: zOptText(60),
  commission: zOptText(60),
  teachers: zOptText(500),
  schedule: zSchedule.default([]),
  status: z.enum(COURSE_STATUSES, { error: "Estado inválido" }).default("cursando"),
  finalGrade: zOptGrade,
  color: zColor,
  notesMd: zOptText(50000),
  spaceId: zOptUuid,
});
export type CourseInput = z.input<typeof courseInput>;

export const assessmentInput = z.object({
  kind: z.enum(ASSESSMENT_KINDS, { error: "Tipo inválido" }).default("parcial"),
  title: zOptText(160),
  date: zDate,
  time: zOptTime,
  topicsMd: zOptText(20000),
  targetGrade: zOptGrade,
  grade: zOptGrade,
});
export type AssessmentInput = z.input<typeof assessmentInput>;

/** Espacio por defecto de Facultad: el de tipo `study` (o el primero si no existe). */
async function studySpace(t: Tx, ctx: Ctx) {
  const spaces = await t.select().from(schema.space).where(scoped(schema.space, ctx)).orderBy(asc(schema.space.sort));
  const pick = spaces.find((s) => s.kind === "study") ?? spaces[0];
  if (!pick) throw notFound("El espacio");
  return pick.id;
}

async function findCourse(t: Tx, ctx: Ctx, id: string) {
  const [row] = await t
    .select()
    .from(schema.course)
    .where(and(eq(schema.course.id, id), scoped(schema.course, ctx)));
  if (!row) throw notFound("La materia");
  return row;
}

async function findAssessment(t: Tx, ctx: Ctx, id: string) {
  const [row] = await t
    .select({ a: schema.assessment, course: schema.course })
    .from(schema.assessment)
    .innerJoin(schema.course, eq(schema.course.id, schema.assessment.courseId))
    .where(and(eq(schema.assessment.id, id), scoped(schema.assessment, ctx), scoped(schema.course, ctx)));
  if (!row) throw notFound("La evaluación");
  return row;
}

export const assessmentTitle = (a: { title: string | null; kind: string }) => a.title?.trim() || label(L.assessmentKind, a.kind);

// --- Materias ---
export async function createCourse(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "study");
  const input = courseInput.parse(raw);
  return getDb().transaction(async (t) => {
    await assertOwned(t, ctx, schema.space, input.spaceId, "El espacio");
    const spaceId = input.spaceId ?? (await studySpace(t, ctx));
    const [row] = await t
      .insert(schema.course)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        name: input.name,
        program: input.program ?? null,
        term: input.term ?? null,
        commission: input.commission ?? null,
        teachers: input.teachers ?? null,
        schedule: input.schedule,
        status: input.status,
        finalGrade: input.finalGrade ?? null,
        color: input.color ?? COURSE_COLORS[0],
        notesMd: input.notesMd ?? null,
        spaceId,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear la materia");
    await recordEvent(t, ctx, { type: "materia.creada", entityType: "course", entityId: row.id, summary: `Agregó la materia «${row.name}»` });
    return row;
  });
}

export async function updateCourse(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "study");
  const input = courseInput.parse(raw);
  return getDb().transaction(async (t) => {
    const before = await findCourse(t, ctx, id);
    const [row] = await t
      .update(schema.course)
      .set({
        name: input.name,
        program: input.program ?? null,
        term: input.term ?? null,
        commission: input.commission ?? null,
        teachers: input.teachers ?? null,
        schedule: input.schedule,
        status: input.status,
        finalGrade: input.finalGrade ?? null,
        color: input.color ?? before.color,
        notesMd: input.notesMd ?? null,
        spaceId: (await assertOwned(t, ctx, schema.space, input.spaceId, "El espacio"), input.spaceId ?? before.spaceId),
      })
      .where(eq(schema.course.id, id))
      .returning();
    if (!row) throw notFound("La materia");
    const statusChanged = before.status !== row.status;
    await recordEvent(t, ctx, {
      type: statusChanged ? "materia.estado_cambiado" : "materia.actualizada",
      entityType: "course",
      entityId: id,
      summary: statusChanged ? `Pasó «${row.name}» a ${label(L.courseStatus, row.status).toLowerCase()}` : `Editó la materia «${row.name}»`,
      payload: statusChanged ? { from: before.status, to: row.status } : {},
    });
    return row;
  });
}

export async function setCourseStatus(ctx: Ctx, id: string, status: (typeof COURSE_STATUSES)[number]) {
  assertCan(ctx, "update", "study");
  const parsed = z.enum(COURSE_STATUSES).parse(status);
  return getDb().transaction(async (t) => {
    const before = await findCourse(t, ctx, id);
    const [row] = await t.update(schema.course).set({ status: parsed }).where(eq(schema.course.id, id)).returning();
    await recordEvent(t, ctx, {
      type: "materia.estado_cambiado",
      entityType: "course",
      entityId: id,
      summary: `Pasó «${before.name}» a ${label(L.courseStatus, parsed).toLowerCase()}`,
      payload: { from: before.status, to: parsed },
    });
    return { course: row, previousStatus: before.status };
  });
}

// --- Evaluaciones ---
export async function createAssessment(ctx: Ctx, courseId: string, raw: unknown) {
  assertCan(ctx, "create", "study");
  const input = assessmentInput.parse(raw);
  return getDb().transaction(async (t) => {
    const course = await findCourse(t, ctx, courseId);
    const [row] = await t
      .insert(schema.assessment)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        courseId,
        kind: input.kind,
        title: input.title ?? null,
        date: input.date,
        time: input.time ?? null,
        topicsMd: input.topicsMd ?? null,
        targetGrade: input.targetGrade ?? null,
        grade: input.grade ?? null,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear la evaluación");
    await recordEvent(t, ctx, {
      type: "evaluacion.creada",
      entityType: "course",
      entityId: courseId,
      summary: `Agendó ${assessmentTitle(row)} de «${course.name}» para el ${formatDate(row.date)}`,
      payload: { assessmentId: row.id, kind: row.kind, date: row.date },
    });
    if (row.grade !== null) await recordGraded(t, ctx, course.name, row);
    return row;
  });
}

async function recordGraded(t: Tx, ctx: Ctx, courseName: string, a: typeof schema.assessment.$inferSelect) {
  await recordEvent(t, ctx, {
    type: "evaluacion.calificada",
    entityType: "course",
    entityId: a.courseId,
    summary: `Cargó la nota de ${assessmentTitle(a)} de «${courseName}»: ${Number(a.grade).toLocaleString("es-AR")}`,
    payload: { assessmentId: a.id, grade: a.grade, targetGrade: a.targetGrade },
  });
}

export async function updateAssessment(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "study");
  const input = assessmentInput.parse(raw);
  return getDb().transaction(async (t) => {
    const { a: before, course } = await findAssessment(t, ctx, id);
    const [row] = await t
      .update(schema.assessment)
      .set({
        kind: input.kind,
        title: input.title ?? null,
        date: input.date,
        time: input.time ?? null,
        topicsMd: input.topicsMd ?? null,
        targetGrade: input.targetGrade ?? null,
        grade: input.grade ?? null,
      })
      .where(eq(schema.assessment.id, id))
      .returning();
    if (!row) throw notFound("La evaluación");
    if (row.grade !== null && row.grade !== before.grade) await recordGraded(t, ctx, course.name, row);
    else
      await recordEvent(t, ctx, {
        type: "evaluacion.actualizada",
        entityType: "course",
        entityId: row.courseId,
        summary: `Editó ${assessmentTitle(row)} de «${course.name}»`,
        payload: { assessmentId: id },
      });
    return row;
  });
}

/** Carga (o borra, con null) la nota obtenida. */
export async function gradeAssessment(ctx: Ctx, id: string, rawGrade: unknown) {
  assertCan(ctx, "update", "study");
  const grade = zOptGrade.parse(rawGrade) ?? null;
  return getDb().transaction(async (t) => {
    const { a: before, course } = await findAssessment(t, ctx, id);
    const [row] = await t.update(schema.assessment).set({ grade }).where(eq(schema.assessment.id, id)).returning();
    if (!row) throw notFound("La evaluación");
    if (grade !== null) await recordGraded(t, ctx, course.name, row);
    else
      await recordEvent(t, ctx, {
        type: "evaluacion.actualizada",
        entityType: "course",
        entityId: row.courseId,
        summary: `Quitó la nota de ${assessmentTitle(row)} de «${course.name}»`,
        payload: { assessmentId: id },
      });
    return { assessment: row, previousGrade: before.grade };
  });
}

// --- Plan de estudio ---
/** Temas a partir del Markdown: un tema por ítem de lista o por línea no vacía (sin encabezados). */
export function topicsFromMarkdown(md: string | null | undefined): string[] {
  if (!md) return [];
  return md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.replace(/^([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, "").trim())
    .filter(Boolean)
    .slice(0, 60);
}

/** Reparte N fechas entre `from` y el día anterior a `until` (inclusive), lo más parejo posible. */
export function spreadDates(n: number, from: string, until: string): string[] {
  const last = addDays(until, -1);
  const span = Math.max(0, diffDays(last, from));
  if (n <= 0) return [];
  if (n === 1) return [from > last ? from : last];
  return Array.from({ length: n }, (_, i) => addDays(from, Math.round((span * i) / (n - 1))));
}

export const studyPlanInput = z.object({
  topics: z.preprocess(
    (v) => (typeof v === "string" ? topicsFromMarkdown(v) : v),
    z.array(z.string().trim().min(1).max(250)).min(1, "Escribí al menos un tema").max(60, "Máximo 60 temas"),
  ),
  startDate: zOptDate,
});

/**
 * Crea una tarea por tema con fechas repartidas desde hoy (o `startDate`) hasta el día anterior
 * a la evaluación, en el espacio de la materia. Vincula cada tarea con la evaluación (`link`).
 */
export async function createStudyPlan(ctx: Ctx, assessmentId: string, raw: unknown) {
  assertCan(ctx, "create", "task");
  const input = studyPlanInput.parse(raw);
  return getDb().transaction(async (t) => {
    const { a, course } = await findAssessment(t, ctx, assessmentId);
    const today = todayAR();
    if (a.date <= today) throw validation("La evaluación ya pasó o es hoy: no hay días para repartir el plan");
    const from = input.startDate && input.startDate > today ? input.startDate : today;
    if (from >= a.date)
      throw validation("El inicio del plan tiene que ser anterior a la evaluación", { startDate: "Elegí una fecha anterior a la evaluación" });
    const dates = spreadDates(input.topics.length, from, a.date);
    const spaceId = course.spaceId ?? (await studySpace(t, ctx));
    const name = `${assessmentTitle(a)} · ${course.name}`;
    const tasks = [];
    for (const [i, topic] of input.topics.entries()) {
      const task = await createTask(
        ctx,
        { title: `Estudiar: ${topic}`, descriptionMd: `Plan de estudio para **${name}** (${formatDate(a.date)}).`, spaceId, dueDate: dates[i], priority: 2 },
        t,
      );
      tasks.push(task);
    }
    await t
      .insert(schema.link)
      .values(
        tasks.map((task) => ({
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
          fromType: "task",
          fromId: task.id,
          toType: "assessment",
          toId: a.id,
          kind: "study_plan",
        })),
      )
      .onConflictDoNothing();
    await recordEvent(t, ctx, {
      type: "evaluacion.plan_creado",
      entityType: "course",
      entityId: course.id,
      summary: `Armó un plan de estudio de ${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"} para ${name}`,
      payload: { assessmentId: a.id, tasks: tasks.length },
    });
    return tasks;
  });
}
