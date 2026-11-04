import { addDays, type Ctx, todayAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";

export type TaskView = "hoy" | "proximas" | "sin-fecha" | "completadas" | "todas";

const taskCols = {
  t: schema.task,
  projectName: schema.project.name,
  clientName: schema.client.name,
  spaceName: schema.space.name,
  spaceColor: schema.space.color,
};

export async function listTasks(ctx: Ctx, opts: { view?: TaskView; projectId?: string; spaceId?: string; q?: string; limit?: number } = {}) {
  const db = getDb();
  const today = todayAR();
  const where = [scoped(schema.task, ctx), isNull(schema.task.parentTaskId)];
  const open = inArray(schema.task.status, ["todo", "doing", "waiting"]);
  switch (opts.view ?? "todas") {
    case "hoy":
      where.push(open, lte(schema.task.dueDate, today));
      break;
    case "proximas":
      where.push(open, gte(schema.task.dueDate, addDays(today, 1)));
      break;
    case "sin-fecha":
      where.push(open, isNull(schema.task.dueDate));
      break;
    case "completadas":
      where.push(eq(schema.task.status, "done"));
      break;
    default:
      where.push(open);
  }
  if (opts.projectId) where.push(eq(schema.task.projectId, opts.projectId));
  if (opts.spaceId) where.push(eq(schema.task.spaceId, opts.spaceId));
  if (opts.q) where.push(sql`f_search_norm(${schema.task.title}) like '%' || f_search_norm(${opts.q}) || '%'`);
  const order =
    opts.view === "completadas"
      ? [desc(schema.task.completedAt)]
      : [sql`${schema.task.dueDate} asc nulls last`, asc(schema.task.priority), asc(schema.task.createdAt)];
  return db
    .select(taskCols)
    .from(schema.task)
    .leftJoin(schema.project, and(eq(schema.project.id, schema.task.projectId), eq(schema.project.workspaceId, schema.task.workspaceId)))
    .leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId)))
    .leftJoin(schema.space, and(eq(schema.space.id, schema.task.spaceId), eq(schema.space.workspaceId, schema.task.workspaceId)))
    .where(and(...where))
    .orderBy(...order)
    .limit(opts.limit ?? 300);
}

export async function getTask(ctx: Ctx, id: string) {
  const db = getDb();
  const [row] = await db
    .select(taskCols)
    .from(schema.task)
    .leftJoin(schema.project, and(eq(schema.project.id, schema.task.projectId), eq(schema.project.workspaceId, schema.task.workspaceId)))
    .leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId)))
    .leftJoin(schema.space, and(eq(schema.space.id, schema.task.spaceId), eq(schema.space.workspaceId, schema.task.workspaceId)))
    .where(and(eq(schema.task.id, id), scoped(schema.task, ctx)));
  if (!row) return null;
  const [subtasks, checklist, phases] = await Promise.all([
    db
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.parentTaskId, id), scoped(schema.task, ctx)))
      .orderBy(asc(schema.task.sort), asc(schema.task.createdAt)),
    db.select().from(schema.taskChecklistItem).where(eq(schema.taskChecklistItem.taskId, id)).orderBy(asc(schema.taskChecklistItem.sort)),
    row.t.projectId
      ? db
          .select()
          .from(schema.projectPhase)
          .where(and(eq(schema.projectPhase.projectId, row.t.projectId), scoped(schema.projectPhase, ctx)))
          .orderBy(asc(schema.projectPhase.sort))
      : Promise.resolve([]),
  ]);
  return { ...row, subtasks, checklist, phases };
}

export async function taskCounts(ctx: Ctx, spaceId?: string) {
  const today = todayAR();
  const sp = spaceId ? sql`and ${schema.task.spaceId} = ${spaceId}` : sql``;
  const [r] = await getDb()
    .execute<{ today: number; overdue: number; open: number }>(sql`
    select
      count(*) filter (where ${schema.task.dueDate} = ${today})::int as today,
      count(*) filter (where ${schema.task.dueDate} < ${today})::int as overdue,
      count(*)::int as open
    from ${schema.task}
    where ${schema.task.workspaceId} = ${ctx.workspaceId} and ${schema.task.deletedAt} is null
      and ${schema.task.status} in ('todo','doing','waiting') ${sp}
  `)
    .then((r) => r.rows);
  return r ?? { today: 0, overdue: 0, open: 0 };
}

export { isNotNull, or };
