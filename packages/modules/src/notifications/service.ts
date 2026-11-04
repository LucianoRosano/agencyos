import type { Ctx } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../shared/db";

export async function listNotifications(ctx: Ctx, limit = 100) {
  if (!ctx.userId) return [];
  return getDb()
    .select()
    .from(schema.notification)
    .where(and(eq(schema.notification.userId, ctx.userId), eq(schema.notification.workspaceId, ctx.workspaceId)))
    .orderBy(desc(schema.notification.createdAt))
    .limit(limit);
}

export async function unreadCount(ctx: Ctx) {
  if (!ctx.userId) return 0;
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notification)
    .where(and(eq(schema.notification.userId, ctx.userId), eq(schema.notification.workspaceId, ctx.workspaceId), isNull(schema.notification.readAt)));
  return r?.n ?? 0;
}

export async function markAllRead(ctx: Ctx) {
  if (!ctx.userId) return;
  await getDb()
    .update(schema.notification)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notification.userId, ctx.userId), eq(schema.notification.workspaceId, ctx.workspaceId), isNull(schema.notification.readAt)));
}

export async function markRead(ctx: Ctx, id: string) {
  if (!ctx.userId) return;
  await getDb()
    .update(schema.notification)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notification.id, id), eq(schema.notification.userId, ctx.userId)));
}
