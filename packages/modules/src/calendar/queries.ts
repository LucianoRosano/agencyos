import { type Ctx, formatMoney, L, label, subMoney, zDate } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, notInArray, type SQL } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";
import { type CalendarItem, type CalendarSource, SOURCE_KEYS, sourceMeta } from "./sources";

export { CALENDAR_SOURCES, type CalendarItem, type CalendarSource, isCalendarSource, SOURCE_KEYS } from "./sources";

/** Máximo de días por consulta (protege la base y el iCal). */
const MAX_RANGE_DAYS = 800;

export type CalendarQuery = { from: string; to: string; sources?: CalendarSource[]; spaceId?: string };

/**
 * Read-model del calendario (docs/02 M12b): todo lo que tiene fecha en [from, to].
 * Solo lee (ADR 0007). Los destinos de cada ítem son los mismos que usa Hoy (today/queries.ts).
 * Como en Hoy, el filtro de espacio aplica a lo que tiene espacio (tareas, etapas, entregas,
 * evaluaciones); dinero, vencimientos y CRM se muestran siempre.
 */
export async function getCalendarItems(ctx: Ctx, q: CalendarQuery): Promise<CalendarItem[]> {
  const from = zDate.parse(q.from);
  const to = zDate.parse(q.to);
  if (to < from) return [];
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_RANGE_DAYS) throw new Error("Rango de calendario demasiado grande");
  const want = new Set<CalendarSource>(q.sources ?? SOURCE_KEYS);
  const db = getDb();
  const sp = q.spaceId;
  const skip = <T>(s: CalendarSource, fn: () => Promise<T[]>): Promise<T[]> => (want.has(s) ? fn() : Promise.resolve([]));
  const inRange = (col: Parameters<typeof gte>[0]): SQL => and(gte(col, from), lte(col, to)) as SQL;

  const [tasks, phases, deliverables, assessments, receivables, payables, subs, reminders, opps, interactions] = await Promise.all([
    skip("task", () =>
      db
        .select({ t: schema.task, projectName: schema.project.name })
        .from(schema.task)
        .leftJoin(schema.project, and(eq(schema.project.id, schema.task.projectId), eq(schema.project.workspaceId, schema.task.workspaceId)))
        .where(
          and(
            scoped(schema.task, ctx),
            inArray(schema.task.status, ["todo", "doing", "waiting"]),
            inRange(schema.task.dueDate),
            sp ? eq(schema.task.spaceId, sp) : undefined,
          ),
        )
        .orderBy(asc(schema.task.dueDate), asc(schema.task.dueTime))
        .limit(2000)),
    skip("phase", () =>
      db
        .select({ ph: schema.projectPhase, projectName: schema.project.name })
        .from(schema.projectPhase)
        .innerJoin(schema.project, eq(schema.project.id, schema.projectPhase.projectId))
        .where(
          and(
            scoped(schema.projectPhase, ctx),
            scoped(schema.project, ctx),
            notInArray(schema.projectPhase.status, ["done"]),
            inRange(schema.projectPhase.dueDate),
            sp ? eq(schema.project.spaceId, sp) : undefined,
          ),
        )),
    skip("deliverable", () =>
      db
        .select({ d: schema.deliverable, projectName: schema.project.name })
        .from(schema.deliverable)
        .innerJoin(schema.project, and(eq(schema.project.id, schema.deliverable.projectId), eq(schema.project.workspaceId, schema.deliverable.workspaceId)))
        .where(
          and(
            scoped(schema.deliverable, ctx),
            scoped(schema.project, ctx),
            inArray(schema.deliverable.status, ["pending", "changes_requested"]),
            inRange(schema.deliverable.dueDate),
            sp ? eq(schema.project.spaceId, sp) : undefined,
          ),
        )),
    skip("assessment", () =>
      db
        .select({ a: schema.assessment, courseName: schema.course.name })
        .from(schema.assessment)
        .innerJoin(schema.course, eq(schema.course.id, schema.assessment.courseId))
        .where(
          and(scoped(schema.assessment, ctx), scoped(schema.course, ctx), inRange(schema.assessment.date), sp ? eq(schema.course.spaceId, sp) : undefined),
        )),
    skip("receivable", () =>
      db
        .select({ r: schema.receivable, clientName: schema.client.name })
        .from(schema.receivable)
        .leftJoin(schema.client, eq(schema.client.id, schema.receivable.clientId))
        .where(and(scoped(schema.receivable, ctx), inArray(schema.receivable.status, ["pending", "partial", "overdue"]), inRange(schema.receivable.dueDate)))),
    skip("payable", () =>
      db
        .select()
        .from(schema.payable)
        .where(and(scoped(schema.payable, ctx), inArray(schema.payable.status, ["pending", "partial", "overdue"]), inRange(schema.payable.dueDate)))),
    skip("subscription", () =>
      db
        .select()
        .from(schema.subscription)
        .where(and(scoped(schema.subscription, ctx), eq(schema.subscription.status, "active"), inRange(schema.subscription.nextDue)))),
    skip("reminder", () =>
      db
        .select()
        .from(schema.reminder)
        .where(and(scoped(schema.reminder, ctx), isNull(schema.reminder.doneAt), inRange(schema.reminder.dueDate)))),
    skip("crm", () =>
      db
        .select({ o: schema.opportunity, clientName: schema.client.name })
        .from(schema.opportunity)
        .leftJoin(schema.client, eq(schema.client.id, schema.opportunity.clientId))
        .where(
          and(
            scoped(schema.opportunity, ctx),
            notInArray(schema.opportunity.stage, ["won", "lost"]),
            isNotNull(schema.opportunity.nextActionDue),
            inRange(schema.opportunity.nextActionDue),
          ),
        )),
    skip("crm", () =>
      db
        .select({ i: schema.interaction, clientName: schema.client.name })
        .from(schema.interaction)
        .leftJoin(schema.client, eq(schema.client.id, schema.interaction.clientId))
        .where(and(scoped(schema.interaction, ctx), isNotNull(schema.interaction.nextStep), inRange(schema.interaction.nextStepDue)))),
  ]);

  const c = (s: CalendarSource) => sourceMeta(s).color;
  const items: CalendarItem[] = [
    ...tasks.map(({ t, projectName }) => ({
      key: `task-${t.id}`,
      source: "task" as const,
      date: t.dueDate ?? from,
      time: t.dueTime,
      title: t.title,
      subtitle: projectName ?? null,
      href: `/tareas/${t.id}`,
      color: c("task"),
    })),
    ...phases.map(({ ph, projectName }) => ({
      key: `phase-${ph.id}`,
      source: "phase" as const,
      date: ph.dueDate ?? from,
      time: null,
      title: `Etapa: ${ph.name}`,
      subtitle: projectName,
      href: `/proyectos/${ph.projectId}/etapas`,
      color: c("phase"),
    })),
    ...deliverables.map(({ d, projectName }) => ({
      key: `deliverable-${d.id}`,
      source: "deliverable" as const,
      date: d.dueDate ?? from,
      time: null,
      title: `Entrega: ${d.title}`,
      subtitle: projectName,
      href: `/proyectos/${d.projectId}/entregas`,
      color: c("deliverable"),
    })),
    ...assessments.map(({ a, courseName }) => ({
      key: `assessment-${a.id}`,
      source: "assessment" as const,
      date: a.date,
      time: a.time,
      title: `${a.title?.trim() || label(L.assessmentKind, a.kind)} · ${courseName}`,
      subtitle: a.grade !== null ? `Nota ${Number(a.grade).toLocaleString("es-AR")}` : label(L.assessmentKind, a.kind),
      href: `/facultad/${a.courseId}`,
      color: c("assessment"),
    })),
    ...receivables.map(({ r, clientName }) => ({
      key: `receivable-${r.id}`,
      source: "receivable" as const,
      date: r.dueDate ?? from,
      time: null,
      title: `Cobro${clientName ? ` ${clientName}` : ""}: ${r.concept}`,
      subtitle: formatMoney(subMoney(r.amount, r.paidAmount), r.currency),
      href: `/finanzas/por-cobrar?cobrar=${r.id}`,
      color: c("receivable"),
    })),
    ...payables.map((p) => ({
      key: `payable-${p.id}`,
      source: "payable" as const,
      date: p.dueDate ?? from,
      time: null,
      title: `Pago ${p.counterpart}: ${p.concept}`,
      subtitle: formatMoney(subMoney(p.amount, p.paidAmount), p.currency),
      href: `/finanzas/por-pagar?pagar=${p.id}`,
      color: c("payable"),
    })),
    ...subs.map((s) => ({
      key: `subscription-${s.id}`,
      source: "subscription" as const,
      date: s.nextDue,
      time: null,
      title: `Pago ${s.vendor}`,
      subtitle: `Suscripción · ${formatMoney(s.amount, s.currency)}`,
      href: `/finanzas/suscripciones?pagar=${s.id}`,
      color: c("subscription"),
    })),
    ...reminders.map((r) => ({
      key: `reminder-${r.id}`,
      source: "reminder" as const,
      date: r.dueDate,
      time: null,
      title: r.title,
      subtitle: label(L.reminderKind, r.kind),
      href: "/hoy",
      color: c("reminder"),
    })),
    ...opps.map(({ o, clientName }) => ({
      key: `opportunity-${o.id}`,
      source: "crm" as const,
      date: o.nextActionDue ?? from,
      time: null,
      title: `${o.nextAction ?? "Seguimiento"}${clientName ? ` · ${clientName}` : ""}`,
      subtitle: `Oportunidad «${o.title}»`,
      href: `/crm/oportunidades/${o.id}`,
      color: c("crm"),
    })),
    ...interactions.map(({ i, clientName }) => ({
      key: `interaction-${i.id}`,
      source: "crm" as const,
      date: i.nextStepDue ?? from,
      time: null,
      title: `${i.nextStep ?? "Próximo paso"}${clientName ? ` · ${clientName}` : ""}`,
      subtitle: "Próximo paso de una conversación",
      href: `/crm/clientes/${i.clientId}`,
      color: c("crm"),
    })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.title.localeCompare(b.title, "es"));
}
