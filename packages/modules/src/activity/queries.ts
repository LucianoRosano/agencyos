import type { Ctx } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, eq, type SQL } from "drizzle-orm";
import { getDb } from "../shared/db";
import { cursorColumn, orderByKeys, paginate, type SortKey } from "../shared/pagination";

type ActivityOpts = { entityType?: string; entityId?: string; limit?: number };

const { id, workspaceId, entityType, entityId, verb, summary, actorType, actorId, actorName, meta, occurredAt } = schema.activity;
const activityCols = { id, workspaceId, entityType, entityId, verb, summary, actorType, actorId, actorName, meta, occurredAt };

const ACTIVITY_KEYS: SortKey[] = [
  { col: schema.activity.occurredAt, dir: "desc" },
  { col: schema.activity.id, dir: "desc" },
];

function activityQuery(ctx: Ctx, opts: ActivityOpts, extra: SQL | undefined, limit: number) {
  const where: SQL[] = [eq(schema.activity.workspaceId, ctx.workspaceId)];
  if (opts.entityType) where.push(eq(schema.activity.entityType, opts.entityType));
  if (opts.entityId) where.push(eq(schema.activity.entityId, opts.entityId));
  if (extra) where.push(extra);
  return getDb()
    .select({ ...activityCols, _cursor: cursorColumn(ACTIVITY_KEYS) })
    .from(schema.activity)
    .where(and(...where))
    .orderBy(...orderByKeys(ACTIVITY_KEYS))
    .limit(limit);
}

export async function listActivity(ctx: Ctx, opts: ActivityOpts = {}) {
  return activityQuery(ctx, opts, undefined, opts.limit ?? 50);
}

/** Actividad paginada por cursor ("Cargar más" con `?hasta=`). */
export async function listActivityPage(ctx: Ctx, opts: ActivityOpts & { hasta?: string | null; pageSize?: number } = {}) {
  return paginate(ACTIVITY_KEYS, (extra, limit) => activityQuery(ctx, opts, extra, limit), { hasta: opts.hasta, pageSize: opts.pageSize });
}
