import type { Ctx } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../shared/db";

export async function listActivity(ctx: Ctx, opts: { entityType?: string; entityId?: string; limit?: number } = {}) {
  const where = [eq(schema.activity.workspaceId, ctx.workspaceId)];
  if (opts.entityType) where.push(eq(schema.activity.entityType, opts.entityType));
  if (opts.entityId) where.push(eq(schema.activity.entityId, opts.entityId));
  return getDb()
    .select()
    .from(schema.activity)
    .where(and(...where))
    .orderBy(desc(schema.activity.occurredAt))
    .limit(opts.limit ?? 50);
}
