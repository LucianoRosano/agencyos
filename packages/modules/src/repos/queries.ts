import { assertCan, type Ctx } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, desc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";
import { appConfigFromEnv, fakeModeEnabled, getGitHubClient } from "./github";
import { inferLinks, isRepoScope } from "./standard";

const T = schema.repository;

/** Estado de la conexión con GitHub para la pantalla vacía / encabezado. */
export async function githubStatus(ctx: Ctx) {
  assertCan(ctx, "read", "project");
  const cfg = appConfigFromEnv();
  const installations = await getDb()
    .select()
    .from(schema.githubInstallation)
    .where(scoped(schema.githubInstallation, ctx))
    .orderBy(asc(schema.githubInstallation.createdAt));
  const appUrl = process.env.APP_URL ?? "";
  return {
    mode: getGitHubClient()?.mode ?? null,
    fake: fakeModeEnabled(),
    appConfigured: Boolean(cfg),
    slug: cfg?.slug ?? null,
    https: appUrl.startsWith("https://"),
    appUrl,
    installations,
  };
}

export async function listRepos(ctx: Ctx, f: { scope?: string; q?: string; band?: string; projectId?: string; clientId?: string } = {}) {
  assertCan(ctx, "read", "project");
  const where = [scoped(T, ctx)];
  if (f.scope === "sin") where.push(isNull(T.scope));
  else if (isRepoScope(f.scope)) where.push(eq(T.scope, f.scope));
  if (f.q) where.push(or(ilike(T.fullName, `%${f.q}%`), ilike(T.description, `%${f.q}%`)) as ReturnType<typeof eq>);
  if (f.band === "red") where.push(lt(T.healthScore, 70));
  if (f.projectId) where.push(eq(T.projectId, f.projectId));
  if (f.clientId) where.push(eq(T.clientId, f.clientId));
  return getDb()
    .select({ r: T, clientName: schema.client.name, projectName: schema.project.name })
    .from(T)
    .leftJoin(schema.client, and(eq(schema.client.id, T.clientId), eq(schema.client.workspaceId, T.workspaceId)))
    .leftJoin(schema.project, and(eq(schema.project.id, T.projectId), eq(schema.project.workspaceId, T.workspaceId)))
    .where(and(...where))
    .orderBy(sql`${T.healthScore} asc nulls first`, asc(T.name))
    .limit(500);
}

export async function scopeCounts(ctx: Ctx) {
  const rows = await getDb()
    .select({ scope: T.scope, n: sql<number>`count(*)::int`, red: sql<number>`count(*) filter (where ${T.healthScore} < 70)::int` })
    .from(T)
    .where(scoped(T, ctx))
    .groupBy(T.scope);
  return rows;
}

export async function getRepo(ctx: Ctx, id: string) {
  assertCan(ctx, "read", "project");
  const db = getDb();
  const [row] = await db
    .select({ r: T, clientName: schema.client.name, projectName: schema.project.name, productName: schema.ownProduct.name })
    .from(T)
    .leftJoin(schema.client, and(eq(schema.client.id, T.clientId), eq(schema.client.workspaceId, T.workspaceId)))
    .leftJoin(schema.project, and(eq(schema.project.id, T.projectId), eq(schema.project.workspaceId, T.workspaceId)))
    .leftJoin(schema.ownProduct, and(eq(schema.ownProduct.id, T.productId), eq(schema.ownProduct.workspaceId, T.workspaceId)))
    .where(and(eq(T.id, id), scoped(T, ctx)));
  if (!row) return null;
  const [checks, events, siteLink] = await Promise.all([
    db.select().from(schema.repoCheck).where(and(eq(schema.repoCheck.repositoryId, id), eq(schema.repoCheck.workspaceId, ctx.workspaceId))),
    db
      .select()
      .from(schema.repoEvent)
      .where(and(eq(schema.repoEvent.repositoryId, id), eq(schema.repoEvent.workspaceId, ctx.workspaceId)))
      .orderBy(desc(schema.repoEvent.at))
      .limit(50),
    db
      .select({ id: schema.site.id, name: schema.site.name })
      .from(schema.link)
      .innerJoin(schema.site, and(eq(schema.site.id, schema.link.toId), eq(schema.site.workspaceId, schema.link.workspaceId)))
      .where(
        and(
          eq(schema.link.workspaceId, ctx.workspaceId),
          eq(schema.link.fromType, "repository"),
          eq(schema.link.fromId, id),
          eq(schema.link.kind, "repo_site"),
          isNull(schema.site.deletedAt),
        ),
      )
      .limit(1),
  ]);
  return { ...row, checks, events, site: siteLink[0] ?? null };
}

/** Opciones y sugerencias para la pestaña Vínculos. */
export async function linkOptions(ctx: Ctx, repo: { id: string; name: string; topics: string[] }) {
  const db = getDb();
  const [clients, projects, products, sites] = await Promise.all([
    db
      .select({ id: schema.client.id, name: schema.client.name, tradeName: schema.client.tradeName })
      .from(schema.client)
      .where(scoped(schema.client, ctx))
      .orderBy(asc(schema.client.name)),
    db
      .select({ id: schema.project.id, name: schema.project.name, clientId: schema.project.clientId })
      .from(schema.project)
      .where(scoped(schema.project, ctx))
      .orderBy(asc(schema.project.name)),
    db
      .select({ id: schema.ownProduct.id, name: schema.ownProduct.name, repositoryId: schema.ownProduct.repositoryId })
      .from(schema.ownProduct)
      .where(scoped(schema.ownProduct, ctx))
      .orderBy(asc(schema.ownProduct.name)),
    db.select({ id: schema.site.id, name: schema.site.name }).from(schema.site).where(scoped(schema.site, ctx)).orderBy(asc(schema.site.name)),
  ]);
  return { clients, projects, products, sites, suggestion: inferLinks(repo, { clients, projects, products }) };
}

export async function listPlans(ctx: Ctx, opts: { status?: string; repositoryId?: string } = {}) {
  assertCan(ctx, "read", "project");
  const db = getDb();
  const where = [scoped(schema.repoPlan, ctx)];
  if (opts.status) where.push(eq(schema.repoPlan.status, opts.status));
  if (opts.repositoryId) {
    where.push(
      inArray(
        schema.repoPlan.id,
        db
          .select({ id: schema.repoPlanAction.planId })
          .from(schema.repoPlanAction)
          .where(and(eq(schema.repoPlanAction.repositoryId, opts.repositoryId), eq(schema.repoPlanAction.workspaceId, ctx.workspaceId))),
      ),
    );
  }
  const plans = await db
    .select()
    .from(schema.repoPlan)
    .where(and(...where))
    .orderBy(desc(schema.repoPlan.createdAt))
    .limit(100);
  const counts = plans.length
    ? await db
        .select({ planId: schema.repoPlanAction.planId, n: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ${schema.repoPlanAction.status} = 'failed')::int` })
        .from(schema.repoPlanAction)
        .where(
          inArray(
            schema.repoPlanAction.planId,
            plans.map((p) => p.id),
          ),
        )
        .groupBy(schema.repoPlanAction.planId)
    : [];
  const m = new Map(counts.map((c) => [c.planId, c]));
  return plans.map((p) => ({ ...p, actions: m.get(p.id)?.n ?? 0, failed: m.get(p.id)?.failed ?? 0 }));
}

export async function getPlan(ctx: Ctx, id: string) {
  assertCan(ctx, "read", "project");
  const db = getDb();
  const [plan] = await db
    .select()
    .from(schema.repoPlan)
    .where(and(eq(schema.repoPlan.id, id), scoped(schema.repoPlan, ctx)));
  if (!plan) return null;
  const actions = await db
    .select({ a: schema.repoPlanAction, repoName: T.fullName })
    .from(schema.repoPlanAction)
    .leftJoin(T, and(eq(T.id, schema.repoPlanAction.repositoryId), eq(T.workspaceId, schema.repoPlanAction.workspaceId)))
    .where(and(eq(schema.repoPlanAction.planId, id), eq(schema.repoPlanAction.workspaceId, ctx.workspaceId)))
    .orderBy(asc(schema.repoPlanAction.createdAt));
  const ids = [id, ...actions.map((x) => x.a.id)];
  const auditRows = await db
    .select()
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.workspaceId, ctx.workspaceId), inArray(schema.auditLog.targetId, ids)))
    .orderBy(asc(schema.auditLog.at))
    .limit(500);
  let approverName: string | null = null;
  if (plan.approvedBy) {
    const [u] = await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, plan.approvedBy));
    approverName = u?.name ?? null;
  }
  return { plan, actions, audit: auditRows, approverName };
}

/** Plantillas tpl-* disponibles para "Crear repositorio". */
export async function listTemplates(ctx: Ctx) {
  return getDb()
    .select({ id: T.id, fullName: T.fullName })
    .from(T)
    .where(and(scoped(T, ctx), eq(T.scope, "tpl"), eq(T.archived, false)))
    .orderBy(asc(T.name));
}
