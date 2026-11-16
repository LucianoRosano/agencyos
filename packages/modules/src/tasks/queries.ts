import { addDays, type Ctx, todayAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import { getDb, projectScope, scoped } from "../shared/db";
import { cursorColumn, orderByKeys, paginate, type SortKey } from "../shared/pagination";

export type TaskView = "hoy" | "proximas" | "sin-fecha" | "completadas" | "todas";

const taskCols = {
  t: schema.task,
  projectName: schema.project.name,
  clientName: schema.client.name,
  spaceName: schema.space.name,
  spaceColor: schema.space.color,
};

export type TaskListOpts = { view?: TaskView; projectId?: string; spaceId?: string; q?: string; limit?: number };

/** Orden de cada vista (la última clave es única: estable para el cursor). */
function taskKeys(view: TaskView | undefined): SortKey[] {
  return view === "completadas"
    ? [
        { col: schema.task.completedAt, dir: "desc" },
        { col: schema.task.id, dir: "desc" },
      ]
    : [
        { col: schema.task.dueDate, dir: "asc", nulls: "last" },
        { col: schema.task.priority, dir: "asc" },
        { col: schema.task.id, dir: "asc" },
      ];
}

function taskWhere(ctx: Ctx, opts: TaskListOpts): SQL[] {
  const today = todayAR();
  const where = [scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId), isNull(schema.task.parentTaskId)].filter(Boolean) as SQL[];
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
  return where;
}

function taskQuery(ctx: Ctx, opts: TaskListOpts, extra: SQL | undefined, limit: number) {
  const keys = taskKeys(opts.view);
  return getDb()
    .select({ ...taskCols, _cursor: cursorColumn(keys) })
    .from(schema.task)
    .leftJoin(schema.project, and(eq(schema.project.id, schema.task.projectId), eq(schema.project.workspaceId, schema.task.workspaceId)))
    .leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId)))
    .leftJoin(schema.space, and(eq(schema.space.id, schema.task.spaceId), eq(schema.space.workspaceId, schema.task.workspaceId)))
    .where(and(...taskWhere(ctx, opts), extra))
    .orderBy(...orderByKeys(keys))
    .limit(limit);
}

export async function listTasks(ctx: Ctx, opts: TaskListOpts = {}) {
  return taskQuery(ctx, opts, undefined, opts.limit ?? 300);
}

/** Lista paginada por cursor ("Cargar más" con `?hasta=`). */
export async function listTasksPage(ctx: Ctx, opts: TaskListOpts & { hasta?: string | null; pageSize?: number } = {}) {
  return paginate(taskKeys(opts.view), (extra, limit) => taskQuery(ctx, opts, extra, limit), { hasta: opts.hasta, pageSize: opts.pageSize });
}

export async function getTask(ctx: Ctx, id: string) {
  const db = getDb();
  const [row] = await db
    .select(taskCols)
    .from(schema.task)
    .leftJoin(schema.project, and(eq(schema.project.id, schema.task.projectId), eq(schema.project.workspaceId, schema.task.workspaceId)))
    .leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId)))
    .leftJoin(schema.space, and(eq(schema.space.id, schema.task.spaceId), eq(schema.space.workspaceId, schema.task.workspaceId)))
    .where(and(eq(schema.task.id, id), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)));
  if (!row) return null;
  const [subtasks, checklist, phases] = await Promise.all([
    db
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.parentTaskId, id), scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)))
      .orderBy(asc(schema.task.sort), asc(schema.task.createdAt)),
    db.select().from(schema.taskChecklistItem).where(eq(schema.taskChecklistItem.taskId, id)).orderBy(asc(schema.taskChecklistItem.sort)),
    row.t.projectId
      ? db
          .select()
          .from(schema.projectPhase)
          .where(and(eq(schema.projectPhase.projectId, row.t.projectId), scoped(schema.projectPhase, ctx), projectScope(ctx, schema.projectPhase.projectId)))
          .orderBy(asc(schema.projectPhase.sort))
      : Promise.resolve([]),
  ]);
  return { ...row, subtasks, checklist, phases };
}

export async function taskCounts(ctx: Ctx, spaceId?: string) {
  const today = todayAR();
  const sp = spaceId ? sql`and ${schema.task.spaceId} = ${spaceId}` : sql``;
  const scope = projectScope(ctx, schema.task.projectId);
  const ps = scope ? sql`and ${scope}` : sql``;
  const [r] = await getDb()
    .execute<{ today: number; overdue: number; open: number }>(sql`
    select
      count(*) filter (where ${schema.task.dueDate} = ${today})::int as today,
      count(*) filter (where ${schema.task.dueDate} < ${today})::int as overdue,
      count(*)::int as open
    from ${schema.task}
    where ${schema.task.workspaceId} = ${ctx.workspaceId} and ${schema.task.deletedAt} is null
      and ${schema.task.status} in ('todo','doing','waiting') ${sp} ${ps}
  `)
    .then((r) => r.rows);
  return r ?? { today: 0, overdue: 0, open: 0 };
}

export { isNotNull, or };
