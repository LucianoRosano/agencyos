import { type Ctx, todayAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";

export const ACTIVE_COURSE_STATUSES = ["cursando", "regular", "final_pendiente"] as const;

type Assessment = typeof schema.assessment.$inferSelect;

/**
 * Una evaluación cuenta como "rendida" si ya pasó su fecha o tiene nota
 * (mismo criterio que el bloque Facultad de Hoy, today/queries.ts).
 */
export const isTaken = (a: Pick<Assessment, "date" | "grade">, today = todayAR()) => a.date < today || a.grade !== null;

/** Promedio de las notas obtenidas, con 2 decimales (string) o null. Aritmética en centésimos (sin float acumulado). */
export function averageGrade(list: Pick<Assessment, "grade">[]): string | null {
  const grades = list.map((a) => a.grade).filter((g): g is string => g !== null);
  if (!grades.length) return null;
  const sum = grades.reduce((acc, g) => acc + Math.round(Number(g) * 100), 0);
  return (Math.round(sum / grades.length) / 100).toFixed(2);
}

export function courseStats(list: Assessment[], today = todayAR()) {
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99"));
  const taken = sorted.filter((a) => isTaken(a, today)).length;
  const next = sorted.find((a) => a.date >= today && a.grade === null) ?? null;
  return { total: sorted.length, taken, progress: sorted.length ? Math.round((taken / sorted.length) * 100) : 0, average: averageGrade(sorted), next };
}

export type CourseFilters = { status?: string; spaceId?: string; includeAll?: boolean };

export async function listCourses(ctx: Ctx, f: CourseFilters = {}) {
  const db = getDb();
  const where = [scoped(schema.course, ctx)];
  if (f.status) where.push(eq(schema.course.status, f.status));
  else if (!f.includeAll) where.push(inArray(schema.course.status, [...ACTIVE_COURSE_STATUSES]));
  if (f.spaceId) where.push(eq(schema.course.spaceId, f.spaceId));
  const courses = await db
    .select()
    .from(schema.course)
    .where(and(...where))
    .orderBy(asc(schema.course.name))
    .limit(200);
  const assess = courses.length
    ? await db
        .select()
        .from(schema.assessment)
        .where(
          and(
            scoped(schema.assessment, ctx),
            inArray(
              schema.assessment.courseId,
              courses.map((c) => c.id),
            ),
          ),
        )
        .orderBy(asc(schema.assessment.date))
    : [];
  const today = todayAR();
  return courses.map((c) => {
    const list = assess.filter((a) => a.courseId === c.id);
    return { ...c, assessments: list, stats: courseStats(list, today) };
  });
}

export type CourseListItem = Awaited<ReturnType<typeof listCourses>>[number];

/** Resumen de Facultad: próximas evaluaciones (sin nota) de materias activas + promedio general. */
export async function studyOverview(ctx: Ctx, opts: { spaceId?: string } = {}) {
  const db = getDb();
  const today = todayAR();
  const where = [scoped(schema.assessment, ctx), scoped(schema.course, ctx)];
  if (opts.spaceId) where.push(eq(schema.course.spaceId, opts.spaceId));
  const rows = await db
    .select({ a: schema.assessment, courseName: schema.course.name, courseColor: schema.course.color, courseStatus: schema.course.status })
    .from(schema.assessment)
    .innerJoin(schema.course, eq(schema.course.id, schema.assessment.courseId))
    .where(and(...where))
    .orderBy(asc(schema.assessment.date), asc(schema.assessment.time));
  const upcoming = rows.filter((r) => r.a.date >= today && r.a.grade === null && (ACTIVE_COURSE_STATUSES as readonly string[]).includes(r.courseStatus));
  return { today, upcoming, average: averageGrade(rows.map((r) => r.a)), graded: rows.filter((r) => r.a.grade !== null).length };
}

export async function getCourse(ctx: Ctx, id: string) {
  const db = getDb();
  const [course] = await db
    .select({ c: schema.course, spaceName: schema.space.name })
    .from(schema.course)
    .leftJoin(schema.space, eq(schema.space.id, schema.course.spaceId))
    .where(and(eq(schema.course.id, id), scoped(schema.course, ctx, { withArchived: true })));
  if (!course) return null;
  const [assessments, notes] = await Promise.all([
    db
      .select()
      .from(schema.assessment)
      .where(and(eq(schema.assessment.courseId, id), scoped(schema.assessment, ctx)))
      .orderBy(asc(schema.assessment.date), asc(schema.assessment.time)),
    db
      .select({ id: schema.note.id, title: schema.note.title, updatedAt: schema.note.updatedAt, wordCount: schema.note.wordCount })
      .from(schema.note)
      .where(and(scoped(schema.note, ctx), eq(schema.note.entityType, "course"), eq(schema.note.entityId, id)))
      .orderBy(desc(schema.note.updatedAt))
      .limit(100),
  ]);
  // Tareas del plan de estudio, vinculadas a cada evaluación.
  const planLinks = assessments.length
    ? await db
        .select({ assessmentId: schema.link.toId, t: schema.task })
        .from(schema.link)
        .innerJoin(schema.task, eq(schema.task.id, schema.link.fromId))
        .where(
          and(
            eq(schema.link.workspaceId, ctx.workspaceId),
            eq(schema.link.kind, "study_plan"),
            eq(schema.link.fromType, "task"),
            eq(schema.link.toType, "assessment"),
            inArray(
              schema.link.toId,
              assessments.map((a) => a.id),
            ),
            scoped(schema.task, ctx),
          ),
        )
        .orderBy(asc(schema.task.dueDate))
    : [];
  const plan = new Map<string, (typeof schema.task.$inferSelect)[]>();
  for (const l of planLinks) plan.set(l.assessmentId, [...(plan.get(l.assessmentId) ?? []), l.t]);
  return { ...course, assessments, notes, plan, stats: courseStats(assessments) };
}

export async function courseOptions(ctx: Ctx) {
  return getDb()
    .select({ id: schema.course.id, name: schema.course.name })
    .from(schema.course)
    .where(scoped(schema.course, ctx))
    .orderBy(asc(schema.course.name));
}
