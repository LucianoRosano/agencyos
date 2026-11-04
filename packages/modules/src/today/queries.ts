import { addDays, addMonths, can, type Ctx, diffDays, endOfMonth, isoWeek, startOfMonth, todayAR, toISODateAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";

/**
 * Read-model de "Hoy" (docs/02 M01). Compone lecturas de varios módulos (ADR 0007):
 * solo lee, nunca escribe; las acciones van a los services de cada módulo.
 */

export type CatchUpItem = {
  key: string;
  kind: "task" | "payable" | "subscription" | "receivable" | "quote" | "reminder" | "project_no_action" | "project_stalled" | "blocker" | "opportunity" | "interaction" | "inbox" | "approval";
  title: string;
  subtitle: string;
  severity: "critical" | "high" | "medium" | "low";
  entityId: string;
  href: string;
  date?: string | null;
};

export type AgendaItem = { key: string; date: string; time?: string | null; title: string; kind: string; color: string; href: string };

const SEV: Record<CatchUpItem["severity"], number> = { critical: 0, high: 1, medium: 2, low: 3 };

export async function getToday(ctx: Ctx, opts: { spaceId?: string; userId: string; now?: Date }) {
  const db = getDb();
  const today = todayAR(opts.now);
  const in7 = addDays(today, 7);
  const sp = opts.spaceId;
  const stalledDays = 14;
  const openTask = inArray(schema.task.status, ["todo", "doing", "waiting"]);
  const spaceTask = sp ? eq(schema.task.spaceId, sp) : undefined;
  const spaceProject = sp ? eq(schema.project.spaceId, sp) : undefined;

  const [
    overdueTasks, todayTasks, picks, payables, subs, receivables, quotes, reminders, projects, blockers, opps, interactions, inboxCount, approvals,
  ] = await Promise.all([
    db.select({ t: schema.task, projectName: schema.project.name, clientName: schema.client.name }).from(schema.task)
      .leftJoin(schema.project, and(eq(schema.project.id, schema.task.projectId), eq(schema.project.workspaceId, schema.task.workspaceId))).leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId)))
      .where(and(scoped(schema.task, ctx), openTask, lt(schema.task.dueDate, today), spaceTask)).orderBy(asc(schema.task.priority), asc(schema.task.dueDate)).limit(50),
    db.select({ t: schema.task, projectName: schema.project.name, clientName: schema.client.name, spaceColor: schema.space.color }).from(schema.task)
      .leftJoin(schema.project, and(eq(schema.project.id, schema.task.projectId), eq(schema.project.workspaceId, schema.task.workspaceId))).leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId))).leftJoin(schema.space, and(eq(schema.space.id, schema.task.spaceId), eq(schema.space.workspaceId, schema.task.workspaceId)))
      .where(and(scoped(schema.task, ctx), or(openTask, and(eq(schema.task.status, "done"), sql`${schema.task.completedAt} >= now() - interval '1 day'`)), lte(schema.task.dueDate, today), spaceTask)).orderBy(asc(schema.task.priority), asc(schema.task.dueTime)),
    db.select({ pick: schema.focusPick, t: schema.task, projectName: schema.project.name, clientName: schema.client.name }).from(schema.focusPick)
      .innerJoin(schema.task, eq(schema.task.id, schema.focusPick.taskId)).leftJoin(schema.project, and(eq(schema.project.id, schema.task.projectId), eq(schema.project.workspaceId, schema.task.workspaceId))).leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId)))
      .where(and(eq(schema.focusPick.userId, opts.userId), eq(schema.focusPick.date, today), isNull(schema.task.deletedAt))).orderBy(asc(schema.focusPick.slot)),
    db.select().from(schema.payable).where(and(scoped(schema.payable, ctx), inArray(schema.payable.status, ["pending", "partial", "overdue"]), lte(schema.payable.dueDate, in7))).orderBy(asc(schema.payable.dueDate)),
    db.select().from(schema.subscription).where(and(scoped(schema.subscription, ctx), eq(schema.subscription.status, "active"), lte(schema.subscription.nextDue, addDays(today, 30)))).orderBy(asc(schema.subscription.nextDue)),
    db.select({ r: schema.receivable, clientName: schema.client.name }).from(schema.receivable).leftJoin(schema.client, eq(schema.client.id, schema.receivable.clientId))
      .where(and(scoped(schema.receivable, ctx), inArray(schema.receivable.status, ["pending", "partial", "overdue"]))).orderBy(asc(schema.receivable.dueDate)),
    db.select({ q: schema.quote, clientName: schema.client.name }).from(schema.quote).leftJoin(schema.client, eq(schema.client.id, schema.quote.clientId))
      .where(and(scoped(schema.quote, ctx), inArray(schema.quote.status, ["sent", "viewed"]), lt(schema.quote.sentAt, new Date(Date.now() - 7 * 86_400_000)))),
    db.select().from(schema.reminder).where(and(scoped(schema.reminder, ctx), isNull(schema.reminder.doneAt), lte(schema.reminder.dueDate, addDays(today, 60)))).orderBy(asc(schema.reminder.dueDate)),
    db.select({ p: schema.project, clientName: schema.client.name, spaceName: schema.space.name, spaceColor: schema.space.color }).from(schema.project)
      .leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId))).leftJoin(schema.space, and(eq(schema.space.id, schema.project.spaceId), eq(schema.space.workspaceId, schema.project.workspaceId)))
      .where(and(scoped(schema.project, ctx), notInArray(schema.project.status, ["done", "archived", "idea"]), spaceProject)).orderBy(asc(schema.project.priority), desc(schema.project.lastActivityAt)),
    db.select({ b: schema.blocker, projectName: schema.project.name }).from(schema.blocker).innerJoin(schema.project, eq(schema.project.id, schema.blocker.projectId))
      .where(and(scoped(schema.blocker, ctx), isNull(schema.blocker.resolvedAt), lte(schema.blocker.revisitOn, today), isNull(schema.project.deletedAt))),
    db.select({ o: schema.opportunity, clientName: schema.client.name }).from(schema.opportunity).leftJoin(schema.client, eq(schema.client.id, schema.opportunity.clientId))
      .where(and(scoped(schema.opportunity, ctx), notInArray(schema.opportunity.stage, ["won", "lost"]), isNotNull(schema.opportunity.nextActionDue), lte(schema.opportunity.nextActionDue, in7))),
    db.select({ i: schema.interaction, clientName: schema.client.name }).from(schema.interaction).leftJoin(schema.client, eq(schema.client.id, schema.interaction.clientId))
      .where(and(scoped(schema.interaction, ctx), isNotNull(schema.interaction.nextStepDue), lte(schema.interaction.nextStepDue, today), isNotNull(schema.interaction.nextStep), gte(schema.interaction.nextStepDue, addDays(today, -30)))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.inboxItem).where(and(scoped(schema.inboxItem, ctx), isNull(schema.inboxItem.processedAt))).then((r) => r[0]?.n ?? 0),
    db.select().from(schema.approval).where(and(scoped(schema.approval, ctx), eq(schema.approval.status, "pending"))).orderBy(desc(schema.approval.createdAt)),
  ]);

  // Sin permiso de finanzas no se muestran montos, pagos ni cobros.
  if (!can(ctx, "read", "finance")) {
    payables.length = 0;
    subs.length = 0;
    receivables.length = 0;
  }

  // --- Ponerse al día ---
  const items: CatchUpItem[] = [];
  for (const { t, projectName, clientName } of overdueTasks) {
    const d = diffDays(today, t.dueDate ?? today);
    items.push({ key: `task-${t.id}`, kind: "task", title: t.title, subtitle: `Tarea vencida hace ${d} d${projectName ? ` · ${projectName}` : clientName ? ` · ${clientName}` : ""}`, severity: t.priority <= 2 ? "critical" : "high", entityId: t.id, href: `/tareas/${t.id}`, date: t.dueDate });
  }
  for (const p of payables) {
    const d = diffDays(p.dueDate ?? today, today);
    items.push({ key: `payable-${p.id}`, kind: "payable", title: `${p.counterpart}: ${p.concept}`, subtitle: d < 0 ? `Pago vencido hace ${-d} d` : d === 0 ? "Pago · vence hoy" : `Pago · vence en ${d} d`, severity: d < 0 ? "critical" : "high", entityId: p.id, href: `/finanzas/por-pagar?pagar=${p.id}`, date: p.dueDate });
  }
  for (const s of subs) {
    const d = diffDays(s.nextDue, today);
    if (d > s.notifyDaysBefore) continue;
    items.push({ key: `sub-${s.id}`, kind: "subscription", title: `Renovar ${s.vendor}`, subtitle: d < 0 ? `Suscripción vencida hace ${-d} d` : `Suscripción · vence el ${s.nextDue.slice(8, 10)}/${s.nextDue.slice(5, 7)}`, severity: d < 0 ? "critical" : "medium", entityId: s.id, href: `/finanzas/suscripciones?pagar=${s.id}`, date: s.nextDue });
  }
  for (const { r, clientName } of receivables) {
    if (!r.dueDate || r.dueDate >= today) continue;
    items.push({ key: `rec-${r.id}`, kind: "receivable", title: `Cobrar a ${clientName ?? "cliente"}: ${r.concept}`, subtitle: `Cobro vencido hace ${diffDays(today, r.dueDate)} d`, severity: "high", entityId: r.id, href: `/finanzas/por-cobrar?cobrar=${r.id}`, date: r.dueDate });
  }
  for (const { q, clientName } of quotes) {
    const d = q.sentAt ? diffDays(today, toISODateAR(q.sentAt)) : 0;
    items.push({ key: `quote-${q.id}`, kind: "quote", title: `Presupuesto ${q.number} · ${clientName ?? ""}`, subtitle: `Enviado hace ${d} d sin respuesta`, severity: "medium", entityId: q.id, href: `/presupuestos/${q.id}` });
  }
  for (const r of reminders) {
    const d = diffDays(r.dueDate, today);
    if (d > r.notifyDaysBefore) continue;
    items.push({ key: `rem-${r.id}`, kind: "reminder", title: r.title, subtitle: d < 0 ? `Venció hace ${-d} d` : `Vence ${r.dueDate.slice(8, 10)}/${r.dueDate.slice(5, 7)} · quedan ${d} días`, severity: d <= 7 ? "critical" : "medium", entityId: r.id, href: "/hoy", date: r.dueDate });
  }
  for (const { p, clientName } of projects) {
    const idle = diffDays(today, toISODateAR(p.lastActivityAt));
    if (["in_progress", "planning"].includes(p.status) && !p.nextAction?.trim()) {
      items.push({ key: `pna-${p.id}`, kind: "project_no_action", title: `${clientName ? `${clientName}: ` : ""}${p.name} sin siguiente acción`, subtitle: `Proyecto · sin movimiento hace ${idle} días`, severity: "medium", entityId: p.id, href: `/proyectos/${p.id}` });
    } else if (["in_progress", "planning", "blocked"].includes(p.status) && idle > stalledDays) {
      items.push({ key: `pst-${p.id}`, kind: "project_stalled", title: `${p.name} frenado`, subtitle: `Proyecto · sin actividad hace ${idle} días`, severity: "low", entityId: p.id, href: `/proyectos/${p.id}` });
    }
  }
  for (const { b, projectName } of blockers) {
    items.push({ key: `blk-${b.id}`, kind: "blocker", title: `${projectName}: ¿llegó lo de ${b.waitingFor}?`, subtitle: "Bloqueo · revisar hoy", severity: "medium", entityId: b.id, href: `/proyectos/${b.projectId}` });
  }
  for (const { o, clientName } of opps) {
    if (!o.nextActionDue || o.nextActionDue > today) continue;
    items.push({ key: `opp-${o.id}`, kind: "opportunity", title: `${o.nextAction ?? "Seguimiento"} · ${clientName ?? o.title}`, subtitle: `Oportunidad «${o.title}» · próxima acción ${o.nextActionDue < today ? "vencida" : "hoy"}`, severity: o.nextActionDue < today ? "high" : "medium", entityId: o.id, href: `/crm/oportunidades/${o.id}` });
  }
  for (const { i, clientName } of interactions) {
    items.push({ key: `int-${i.id}`, kind: "interaction", title: `${i.nextStep} · ${clientName ?? ""}`, subtitle: "Próximo paso de una conversación", severity: "medium", entityId: i.id, href: `/crm/clientes/${i.clientId}` });
  }
  if (inboxCount > 0) items.push({ key: "inbox", kind: "inbox", title: `${inboxCount} ${inboxCount === 1 ? "ítem" : "ítems"} en la Bandeja sin procesar`, subtitle: "Procesalos uno por uno", severity: "low", entityId: "", href: "/bandeja" });
  for (const a of approvals) items.push({ key: `apr-${a.id}`, kind: "approval", title: a.title, subtitle: "Propuesta de Claude esperando aprobación", severity: "medium", entityId: a.id, href: "/aprobaciones" });
  items.sort((a, b) => SEV[a.severity] - SEV[b.severity] || (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  // --- Foco ---
  const focus = picks.map((x) => ({ slot: x.pick.slot, suggested: false, task: { ...x.t, projectName: x.projectName, clientName: x.clientName } }));
  if (focus.length < 3) {
    const used = new Set(focus.map((f) => f.task.id));
    const candidates = [
      ...overdueTasks.filter((x) => x.t.priority <= 2),
      ...todayTasks.filter((x) => x.t.dueDate === today && x.t.status !== "done"),
    ];
    for (const c of candidates) {
      if (focus.length >= 3) break;
      if (used.has(c.t.id)) continue;
      used.add(c.t.id);
      focus.push({ slot: focus.length + 1, suggested: true, task: { ...c.t, projectName: c.projectName, clientName: c.clientName } });
    }
    if (focus.length < 3) {
      const ids = projects.filter((x) => x.p.status === "in_progress").map((x) => x.p.id);
      if (ids.length) {
        const next = await db.select({ t: schema.task, projectName: schema.project.name, clientName: schema.client.name, target: schema.project.targetDate }).from(schema.task)
          .innerJoin(schema.project, eq(schema.project.id, schema.task.projectId)).leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId)))
          .where(and(scoped(schema.task, ctx), openTask, inArray(schema.task.projectId, ids), isNull(schema.task.parentTaskId)))
          .orderBy(sql`${schema.project.targetDate} asc nulls last`, sql`${schema.task.dueDate} asc nulls last`, asc(schema.task.sort)).limit(20);
        const seenProject = new Set<string>();
        for (const n of next) {
          if (focus.length >= 3) break;
          if (used.has(n.t.id) || seenProject.has(n.t.projectId ?? "")) continue;
          seenProject.add(n.t.projectId ?? "");
          used.add(n.t.id);
          focus.push({ slot: focus.length + 1, suggested: true, task: { ...n.t, projectName: n.projectName, clientName: n.clientName } });
        }
      }
    }
  }

  // --- Próximos 7 días ---
  const end = addDays(today, 6);
  const [agTasks, agAssess, agDeliv] = await Promise.all([
    db.select({ t: schema.task, projectName: schema.project.name }).from(schema.task).leftJoin(schema.project, and(eq(schema.project.id, schema.task.projectId), eq(schema.project.workspaceId, schema.task.workspaceId)))
      .where(and(scoped(schema.task, ctx), openTask, gte(schema.task.dueDate, today), lte(schema.task.dueDate, end), spaceTask)).orderBy(asc(schema.task.dueDate), asc(schema.task.dueTime)).limit(60),
    db.select({ a: schema.assessment, courseName: schema.course.name }).from(schema.assessment).innerJoin(schema.course, eq(schema.course.id, schema.assessment.courseId))
      .where(and(scoped(schema.assessment, ctx), gte(schema.assessment.date, today), lte(schema.assessment.date, end), isNull(schema.course.deletedAt))),
    db.select({ d: schema.deliverable, projectName: schema.project.name }).from(schema.deliverable).innerJoin(schema.project, and(eq(schema.project.id, schema.deliverable.projectId), eq(schema.project.workspaceId, schema.deliverable.workspaceId)))
      .where(and(scoped(schema.deliverable, ctx), inArray(schema.deliverable.status, ["pending", "changes_requested"]), gte(schema.deliverable.dueDate, today), lte(schema.deliverable.dueDate, end))),
  ]);
  const agenda: AgendaItem[] = ([
    ...agTasks.map(({ t, projectName }) => ({ key: `t-${t.id}`, date: t.dueDate ?? today, time: t.dueTime, title: t.title + (projectName ? ` · ${projectName}` : ""), kind: "Tarea", color: "#7C5CFF", href: `/tareas/${t.id}` })),
    ...agAssess.map(({ a, courseName }) => ({ key: `a-${a.id}`, date: a.date, time: a.time, title: `${a.title ?? a.kind} · ${courseName}`, kind: "Evaluación", color: "#FBBF24", href: `/facultad/${a.courseId}` })),
    ...agDeliv.map(({ d, projectName }) => ({ key: `d-${d.id}`, date: d.dueDate ?? today, title: `Entrega: ${d.title} · ${projectName}`, time: null, kind: "Entrega", color: "#A78BFA", href: `/proyectos/${d.projectId}/entregas` })),
    ...payables.filter((p) => p.dueDate && p.dueDate >= today && p.dueDate <= end).map((p) => ({ key: `p-${p.id}`, date: p.dueDate ?? today, title: `Pago ${p.counterpart}`, kind: "Pago", color: "#34D399", href: `/finanzas/por-pagar?pagar=${p.id}` })),
    ...subs.filter((s) => s.nextDue >= today && s.nextDue <= end).map((s) => ({ key: `s-${s.id}`, date: s.nextDue, title: `Pago ${s.vendor}`, kind: "Suscripción", color: "#34D399", href: `/finanzas/suscripciones?pagar=${s.id}` })),
    ...receivables.filter(({ r }) => r.dueDate && r.dueDate >= today && r.dueDate <= end).map(({ r, clientName }) => ({ key: `r-${r.id}`, date: r.dueDate ?? today, title: `Cobro ${clientName ?? ""}: ${r.concept}`, kind: "Cobro", color: "#34D399", href: `/finanzas/por-cobrar?cobrar=${r.id}` })),
    ...reminders.filter((r) => r.dueDate >= today && r.dueDate <= end).map((r) => ({ key: `rm-${r.id}`, date: r.dueDate, title: r.title, kind: "Vencimiento", color: "#F472B6", href: "/hoy" })),
    ...opps.filter(({ o }) => o.nextActionDue && o.nextActionDue >= today && o.nextActionDue <= end).map(({ o, clientName }) => ({ key: `o-${o.id}`, date: o.nextActionDue ?? today, title: `${o.nextAction ?? "Seguimiento"} · ${clientName ?? ""}`, kind: "CRM", color: "#22D3EE", href: `/crm/oportunidades/${o.id}` })),
  ] as AgendaItem[]).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99"));

  // --- Dinero del mes ---
  const money = can(ctx, "read", "finance") ? await moneySummary(ctx, today) : { month: today.slice(0, 7), income: [], expense: [], receivable: [], payable: [], activeSubscriptions: 0, series: [], hasData: false };

  // --- Facultad ---
  const courses = await db.select().from(schema.course).where(and(scoped(schema.course, ctx), inArray(schema.course.status, ["cursando", "final_pendiente", "regular"]))).orderBy(asc(schema.course.name));
  let study: null | { next: { title: string; courseName: string; date: string; time: string | null; targetGrade: string | null; courseId: string } | null; upcoming: { title: string; date: string }[]; courses: { id: string; name: string; progress: number; color: string | null }[] } = null;
  if (courses.length) {
    const assess = await db.select().from(schema.assessment).where(and(scoped(schema.assessment, ctx), inArray(schema.assessment.courseId, courses.map((c) => c.id)))).orderBy(asc(schema.assessment.date));
    const future = assess.filter((a) => a.date >= today);
    const cname = new Map(courses.map((c) => [c.id, c.name]));
    const nx = future[0];
    study = {
      next: nx ? { title: `${nx.title ?? nx.kind}`, courseName: cname.get(nx.courseId) ?? "", date: nx.date, time: nx.time, targetGrade: nx.targetGrade, courseId: nx.courseId } : null,
      upcoming: future.slice(1, 3).map((a) => ({ title: `${cname.get(a.courseId)} · ${a.title ?? a.kind}`, date: a.date })),
      courses: courses.map((c) => {
        const list = assess.filter((a) => a.courseId === c.id);
        return { id: c.id, name: c.name, color: c.color, progress: list.length ? Math.round((list.filter((a) => a.date < today || a.grade !== null).length / list.length) * 100) : 0 };
      }),
    };
  }

  // --- Notas recientes ---
  const recentNotes = await db.select({ id: schema.note.id, title: schema.note.title, updatedAt: schema.note.updatedAt }).from(schema.note).where(scoped(schema.note, ctx)).orderBy(desc(schema.note.updatedAt)).limit(4);
  const linkCounts = recentNotes.length
    ? await db.select({ id: schema.link.fromId, n: sql<number>`count(*)::int` }).from(schema.link).where(and(eq(schema.link.workspaceId, ctx.workspaceId), inArray(schema.link.fromId, recentNotes.map((n) => n.id)))).groupBy(schema.link.fromId)
    : [];
  const lc = new Map(linkCounts.map((l) => [l.id, l.n]));

  // --- Semana ---
  const weekStart = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const [week] = await db.select({
    total: sql<number>`count(*) filter (where ${schema.task.status} <> 'cancelled')::int`,
    done: sql<number>`count(*) filter (where ${schema.task.status} = 'done')::int`,
  }).from(schema.task).where(and(scoped(schema.task, ctx), gte(schema.task.dueDate, weekStart), lte(schema.task.dueDate, addDays(weekStart, 6)), isNull(schema.task.parentTaskId)));

  const forToday = todayTasks.filter((x) => x.t.dueDate === today && x.t.status !== "done").length;
  const paymentsSoon = payables.length + subs.filter((s) => diffDays(s.nextDue, today) <= s.notifyDaysBefore).length;

  return {
    today,
    week: { number: isoWeek(today), done: week?.done ?? 0, total: week?.total ?? 0 },
    counts: { forToday, overdue: overdueTasks.length, paymentsSoon, inbox: inboxCount },
    focus,
    catchUp: items,
    agenda,
    money,
    study,
    recentNotes: recentNotes.map((n) => ({ ...n, links: lc.get(n.id) ?? 0 })),
    projects: projects
      .filter((x) => ["in_progress", "planning", "blocked", "paused"].includes(x.p.status))
      .map((x) => ({ ...x.p, clientName: x.clientName, spaceName: x.spaceName, spaceColor: x.spaceColor, stalled: x.p.status === "paused" || diffDays(today, toISODateAR(x.p.lastActivityAt)) > stalledDays })),
  };
}

export type TodayData = Awaited<ReturnType<typeof getToday>>;

/** Resumen de dinero del mes + 6 meses (por moneda; nunca convierte con tasas inventadas). */
export async function moneySummary(ctx: Ctx, today = todayAR()) {
  const db = getDb();
  const from = startOfMonth(today);
  const to = endOfMonth(today);
  const sixFrom = startOfMonth(addMonths(today, -5));
  const [month, series, rec, pay, subsCount] = await Promise.all([
    db.select({ kind: schema.transaction.kind, currency: schema.transaction.currency, total: sql<string>`sum(${schema.transaction.amount})::text` }).from(schema.transaction)
      .where(and(scoped(schema.transaction, ctx), gte(schema.transaction.date, from), lte(schema.transaction.date, to), inArray(schema.transaction.kind, ["income", "expense"])))
      .groupBy(schema.transaction.kind, schema.transaction.currency),
    db.select({ month: sql<string>`to_char(${schema.transaction.date}, 'YYYY-MM')`, kind: schema.transaction.kind, total: sql<string>`sum(${schema.transaction.amount})::text` }).from(schema.transaction)
      .where(and(scoped(schema.transaction, ctx), gte(schema.transaction.date, sixFrom), lte(schema.transaction.date, to), inArray(schema.transaction.kind, ["income", "expense"]), eq(schema.transaction.currency, "ARS")))
      .groupBy(sql`1`, schema.transaction.kind),
    db.select({ currency: schema.receivable.currency, total: sql<string>`sum(${schema.receivable.amount} - ${schema.receivable.paidAmount})::text`, n: sql<number>`count(*)::int` }).from(schema.receivable)
      .where(and(scoped(schema.receivable, ctx), inArray(schema.receivable.status, ["pending", "partial", "overdue"]))).groupBy(schema.receivable.currency),
    db.select({ currency: schema.payable.currency, total: sql<string>`sum(${schema.payable.amount} - ${schema.payable.paidAmount})::text`, n: sql<number>`count(*)::int`, next: sql<string | null>`min(${schema.payable.dueDate})::text` }).from(schema.payable)
      .where(and(scoped(schema.payable, ctx), inArray(schema.payable.status, ["pending", "partial", "overdue"]))).groupBy(schema.payable.currency),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.subscription).where(and(scoped(schema.subscription, ctx), eq(schema.subscription.status, "active"))).then((r) => r[0]?.n ?? 0),
  ]);
  const months: { key: string; label: string; income: number; expense: number }[] = [];
  const MS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  for (let i = 5; i >= 0; i--) {
    const k = addMonths(today, -i).slice(0, 7);
    months.push({ key: k, label: MS[Number(k.slice(5, 7)) - 1] ?? k, income: 0, expense: 0 });
  }
  for (const s of series) {
    const m = months.find((x) => x.key === s.month);
    if (m) m[s.kind === "income" ? "income" : "expense"] = Number(s.total);
  }
  return {
    month: from.slice(0, 7),
    income: month.filter((m) => m.kind === "income").map((m) => ({ currency: m.currency, total: m.total })),
    expense: month.filter((m) => m.kind === "expense").map((m) => ({ currency: m.currency, total: m.total })),
    receivable: rec.map((r) => ({ currency: r.currency, total: r.total, n: r.n })),
    payable: pay.map((r) => ({ currency: r.currency, total: r.total, n: r.n, next: r.next })),
    activeSubscriptions: subsCount,
    series: months,
    hasData: month.length > 0 || series.length > 0 || rec.length > 0 || pay.length > 0,
  };
}
