import type { Ctx } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";

export type ProjectFilters = { status?: string; spaceId?: string; clientId?: string; q?: string; includeDone?: boolean };

export async function listProjects(ctx: Ctx, f: ProjectFilters = {}) {
  const db = getDb();
  const where = [scoped(schema.project, ctx)];
  if (f.status) where.push(eq(schema.project.status, f.status));
  else if (!f.includeDone) where.push(notInArray(schema.project.status, ["done", "archived"]));
  if (f.spaceId) where.push(eq(schema.project.spaceId, f.spaceId));
  if (f.clientId) where.push(eq(schema.project.clientId, f.clientId));
  if (f.q) where.push(sql`f_search_norm(${schema.project.name}) like '%' || f_search_norm(${f.q}) || '%'`);
  return db
    .select({
      p: schema.project,
      clientName: schema.client.name,
      spaceName: schema.space.name,
      spaceColor: schema.space.color,
    })
    .from(schema.project)
    .leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId)))
    .leftJoin(schema.space, and(eq(schema.space.id, schema.project.spaceId), eq(schema.space.workspaceId, schema.project.workspaceId)))
    .where(and(...where))
    .orderBy(asc(schema.project.priority), desc(schema.project.lastActivityAt))
    .limit(500);
}

export async function getProject(ctx: Ctx, id: string) {
  const db = getDb();
  const [row] = await db
    .select({ p: schema.project, clientName: schema.client.name, spaceName: schema.space.name, spaceColor: schema.space.color })
    .from(schema.project)
    .leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId)))
    .leftJoin(schema.space, and(eq(schema.space.id, schema.project.spaceId), eq(schema.space.workspaceId, schema.project.workspaceId)))
    .where(and(eq(schema.project.id, id), scoped(schema.project, ctx, { withArchived: true })));
  if (!row) return null;
  const [phases, tasks, blockers, decisions, deliverables, changelog] = await Promise.all([
    db
      .select()
      .from(schema.projectPhase)
      .where(and(eq(schema.projectPhase.projectId, id), scoped(schema.projectPhase, ctx)))
      .orderBy(asc(schema.projectPhase.sort)),
    db
      .select()
      .from(schema.task)
      .where(and(eq(schema.task.projectId, id), scoped(schema.task, ctx)))
      .orderBy(asc(schema.task.status), asc(schema.task.sort), asc(schema.task.dueDate)),
    db
      .select()
      .from(schema.blocker)
      .where(and(eq(schema.blocker.projectId, id), scoped(schema.blocker, ctx)))
      .orderBy(desc(schema.blocker.createdAt)),
    db
      .select()
      .from(schema.decision)
      .where(and(eq(schema.decision.projectId, id), scoped(schema.decision, ctx)))
      .orderBy(desc(schema.decision.decidedOn)),
    db
      .select()
      .from(schema.deliverable)
      .where(and(eq(schema.deliverable.projectId, id), scoped(schema.deliverable, ctx)))
      .orderBy(asc(schema.deliverable.dueDate)),
    db
      .select()
      .from(schema.changelogEntry)
      .where(and(eq(schema.changelogEntry.projectId, id), scoped(schema.changelogEntry, ctx)))
      .orderBy(desc(schema.changelogEntry.createdAt))
      .limit(100),
  ]);
  return { ...row, phases, tasks, blockers, decisions, deliverables, changelog };
}

export async function listTemplates(ctx: Ctx) {
  return getDb()
    .select()
    .from(schema.projectTemplate)
    .where(scoped(schema.projectTemplate, ctx))
    .orderBy(asc(schema.projectTemplate.sort), asc(schema.projectTemplate.name));
}

export async function projectOptions(ctx: Ctx) {
  return getDb()
    .select({ id: schema.project.id, name: schema.project.name, spaceId: schema.project.spaceId, clientId: schema.project.clientId })
    .from(schema.project)
    .where(and(scoped(schema.project, ctx), notInArray(schema.project.status, ["done", "archived"])))
    .orderBy(asc(schema.project.name));
}

export async function projectsByIds(ctx: Ctx, ids: string[]) {
  if (!ids.length) return [];
  return getDb()
    .select()
    .from(schema.project)
    .where(and(scoped(schema.project, ctx), inArray(schema.project.id, ids)));
}

export { isNull };
