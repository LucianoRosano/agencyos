import { assertCan, type Ctx } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { brandFromSettings } from "../quotes/queries";
import { getDb, scoped } from "../shared/db";
import type { BlueprintTree } from "./blueprint";

export type SiteFilters = { status?: string; clientId?: string; q?: string };

const slotsDone = sql<number>`(select count(*)::int from content_slot cs where cs.site_id = ${schema.site.id} and cs.deleted_at is null and cs.archived_at is null and cs.status in ('approved','published'))`;
const slotsTotal = sql<number>`(select count(*)::int from content_slot cs where cs.site_id = ${schema.site.id} and cs.deleted_at is null and cs.archived_at is null)`;
const checksDone = sql<number>`(select count(*)::int from launch_check lc where lc.site_id = ${schema.site.id} and lc.deleted_at is null and lc.status in ('done','na'))`;
const checksTotal = sql<number>`(select count(*)::int from launch_check lc where lc.site_id = ${schema.site.id} and lc.deleted_at is null)`;
const openItems = sql<number>`(select count(*)::int from revision_item ri join revision_round rr on rr.id = ri.round_id where rr.site_id = ${schema.site.id} and rr.status = 'open' and ri.deleted_at is null and ri.status in ('open','in_progress'))`;

const baseSelect = {
  s: schema.site,
  clientName: schema.client.name,
  projectName: schema.project.name,
  slotsDone,
  slotsTotal,
  checksDone,
  checksTotal,
  openItems,
};

function joined() {
  return getDb()
    .select(baseSelect)
    .from(schema.site)
    .leftJoin(schema.client, and(eq(schema.client.id, schema.site.clientId), eq(schema.client.workspaceId, schema.site.workspaceId)))
    .leftJoin(schema.project, and(eq(schema.project.id, schema.site.projectId), eq(schema.project.workspaceId, schema.site.workspaceId)));
}

export async function listSites(ctx: Ctx, f: SiteFilters = {}) {
  assertCan(ctx, "read", "project");
  const where = [scoped(schema.site, ctx)];
  if (f.status) where.push(eq(schema.site.publicationStatus, f.status));
  if (f.clientId) where.push(eq(schema.site.clientId, f.clientId));
  if (f.q) where.push(sql`f_search_norm(${schema.site.name}) like '%' || f_search_norm(${f.q}) || '%'`);
  return joined()
    .where(and(...where))
    .orderBy(desc(schema.site.updatedAt))
    .limit(300);
}

export async function getSite(ctx: Ctx, id: string) {
  assertCan(ctx, "read", "project");
  const [row] = await joined().where(and(eq(schema.site.id, id), scoped(schema.site, ctx, { withArchived: true })));
  return row ?? null;
}

export type SiteSummary = NonNullable<Awaited<ReturnType<typeof getSite>>>;

/** Sitio de un proyecto (para el botón «Crear sitio» / «Ver sitio» de la ficha de proyecto). */
export async function siteForProject(ctx: Ctx, projectId: string) {
  const [row] = await getDb()
    .select({ id: schema.site.id, name: schema.site.name })
    .from(schema.site)
    .where(and(eq(schema.site.projectId, projectId), scoped(schema.site, ctx, { withArchived: true })))
    .limit(1);
  return row ?? null;
}

/** Clientes y proyectos activos para los formularios del sitio. */
export async function siteFormOptions(ctx: Ctx) {
  const db = getDb();
  const [clients, projects] = await Promise.all([
    db
      .select({ id: schema.client.id, name: schema.client.name })
      .from(schema.client)
      .where(and(scoped(schema.client, ctx), sql`${schema.client.status} <> 'archived'`))
      .orderBy(asc(schema.client.name)),
    db
      .select({ id: schema.project.id, name: schema.project.name, clientId: schema.project.clientId, kind: schema.project.kind })
      .from(schema.project)
      .where(and(scoped(schema.project, ctx), sql`${schema.project.status} not in ('done','archived')`))
      .orderBy(asc(schema.project.name)),
  ]);
  return { clients, projects };
}

export async function projectPrefill(ctx: Ctx, projectId: string) {
  const [p] = await getDb()
    .select({ id: schema.project.id, name: schema.project.name, clientId: schema.project.clientId, kind: schema.project.kind })
    .from(schema.project)
    .where(and(eq(schema.project.id, projectId), scoped(schema.project, ctx)));
  return p ?? null;
}

// --- Pestañas ---

export async function getBrief(ctx: Ctx, siteId: string) {
  const [b] = await getDb()
    .select()
    .from(schema.siteBrief)
    .where(and(eq(schema.siteBrief.siteId, siteId), scoped(schema.siteBrief, ctx)))
    .orderBy(desc(schema.siteBrief.version))
    .limit(1);
  return b ?? null;
}

export async function listRequirements(ctx: Ctx, siteId: string) {
  return getDb()
    .select()
    .from(schema.siteRequirement)
    .where(and(eq(schema.siteRequirement.siteId, siteId), scoped(schema.siteRequirement, ctx)))
    .orderBy(asc(schema.siteRequirement.sort), asc(schema.siteRequirement.createdAt));
}

export async function getBlueprint(ctx: Ctx, siteId: string) {
  const db = getDb();
  const [current, versions] = await Promise.all([
    db
      .select()
      .from(schema.siteBlueprint)
      .where(and(eq(schema.siteBlueprint.siteId, siteId), eq(schema.siteBlueprint.isCurrent, true), scoped(schema.siteBlueprint, ctx)))
      .limit(1),
    db
      .select({
        id: schema.siteBlueprint.id,
        version: schema.siteBlueprint.version,
        source: schema.siteBlueprint.source,
        createdAt: schema.siteBlueprint.createdAt,
        isCurrent: schema.siteBlueprint.isCurrent,
        pages: sql<number>`jsonb_array_length(${schema.siteBlueprint.tree}->'pages')`,
      })
      .from(schema.siteBlueprint)
      .where(and(eq(schema.siteBlueprint.siteId, siteId), scoped(schema.siteBlueprint, ctx)))
      .orderBy(desc(schema.siteBlueprint.version))
      .limit(50),
  ]);
  const cur = current[0];
  return { current: cur ? { ...cur, tree: cur.tree as BlueprintTree } : null, versions };
}

export async function listSlots(ctx: Ctx, siteId: string) {
  return getDb()
    .select()
    .from(schema.contentSlot)
    .where(and(eq(schema.contentSlot.siteId, siteId), scoped(schema.contentSlot, ctx)));
}

export async function listRounds(ctx: Ctx, siteId: string) {
  const db = getDb();
  const rounds = await db
    .select()
    .from(schema.revisionRound)
    .where(and(eq(schema.revisionRound.siteId, siteId), scoped(schema.revisionRound, ctx)))
    .orderBy(desc(schema.revisionRound.number));
  const items = rounds.length
    ? await db
        .select()
        .from(schema.revisionItem)
        .where(
          and(
            inArray(
              schema.revisionItem.roundId,
              rounds.map((r) => r.id),
            ),
            scoped(schema.revisionItem, ctx),
          ),
        )
        .orderBy(asc(schema.revisionItem.priority), asc(schema.revisionItem.createdAt))
    : [];
  return rounds.map((r) => ({ ...r, items: items.filter((i) => i.roundId === r.id) }));
}

export async function listLaunchChecks(ctx: Ctx, siteId: string) {
  return getDb()
    .select()
    .from(schema.launchCheck)
    .where(and(eq(schema.launchCheck.siteId, siteId), scoped(schema.launchCheck, ctx)))
    .orderBy(asc(schema.launchCheck.sort), asc(schema.launchCheck.createdAt));
}

export async function listEnvironments(ctx: Ctx, siteId: string) {
  return getDb()
    .select({ e: schema.siteEnvironment, hostingProvider: schema.hosting.provider, hostingPlan: schema.hosting.plan })
    .from(schema.siteEnvironment)
    .leftJoin(schema.hosting, and(eq(schema.hosting.id, schema.siteEnvironment.hostingId), eq(schema.hosting.workspaceId, schema.siteEnvironment.workspaceId)))
    .where(and(eq(schema.siteEnvironment.siteId, siteId), scoped(schema.siteEnvironment, ctx)))
    .orderBy(asc(schema.siteEnvironment.kind), asc(schema.siteEnvironment.createdAt));
}

/** Dominio, hosting y certificados vinculados al sitio o a su cliente (solo lectura; se administran en Activos técnicos). */
export async function siteAssets(ctx: Ctx, site: { id: string; clientId: string | null }) {
  const db = getDb();
  const byClient = <T extends { clientId: unknown; siteId?: unknown }>(t: T) =>
    site.clientId
      ? // biome-ignore lint/suspicious/noExplicitAny: columnas genéricas
        or(eq(t.siteId as any, site.id), and(eq(t.clientId as any, site.clientId), isNull(t.siteId as any)))
      : // biome-ignore lint/suspicious/noExplicitAny: columnas genéricas
        eq(t.siteId as any, site.id);
  const envHostings = db
    .select({ id: schema.siteEnvironment.hostingId })
    .from(schema.siteEnvironment)
    .where(and(eq(schema.siteEnvironment.siteId, site.id), scoped(schema.siteEnvironment, ctx)));
  const [domains, hostings, certificates] = await Promise.all([
    db
      .select({ d: schema.domain, credential: schema.credentialRef.label, credentialPath: schema.credentialRef.itemPath })
      .from(schema.domain)
      .leftJoin(schema.credentialRef, and(eq(schema.credentialRef.id, schema.domain.credentialRefId), eq(schema.credentialRef.workspaceId, schema.domain.workspaceId)))
      .where(and(scoped(schema.domain, ctx), byClient(schema.domain)))
      .orderBy(asc(schema.domain.name)),
    db
      .select({ h: schema.hosting, credential: schema.credentialRef.label, credentialPath: schema.credentialRef.itemPath })
      .from(schema.hosting)
      .leftJoin(schema.credentialRef, and(eq(schema.credentialRef.id, schema.hosting.credentialRefId), eq(schema.credentialRef.workspaceId, schema.hosting.workspaceId)))
      .where(
        and(
          scoped(schema.hosting, ctx),
          site.clientId ? or(eq(schema.hosting.clientId, site.clientId), inArray(schema.hosting.id, envHostings)) : inArray(schema.hosting.id, envHostings),
        ),
      )
      .orderBy(asc(schema.hosting.provider)),
    db
      .select()
      .from(schema.certificate)
      .where(and(scoped(schema.certificate, ctx), byClient(schema.certificate)))
      .orderBy(asc(schema.certificate.expiresOn)),
  ]);
  return { domains, hostings, certificates };
}

/** Hostings del workspace para vincular un entorno. */
export async function hostingOptions(ctx: Ctx) {
  return getDb()
    .select({ id: schema.hosting.id, provider: schema.hosting.provider, plan: schema.hosting.plan })
    .from(schema.hosting)
    .where(scoped(schema.hosting, ctx))
    .orderBy(asc(schema.hosting.provider));
}

/** Últimos chequeos de uptime por entorno (los genera Activos técnicos). */
export async function siteMonitoring(ctx: Ctx, siteId: string) {
  const envs = await listEnvironments(ctx, siteId);
  if (!envs.length) return { envs, checks: [] as (typeof schema.uptimeCheck.$inferSelect)[] };
  const ids = envs.map((e) => e.e.id);
  const checks = await getDb()
    .select()
    .from(schema.uptimeCheck)
    .where(and(eq(schema.uptimeCheck.workspaceId, ctx.workspaceId), inArray(schema.uptimeCheck.siteEnvironmentId, ids)))
    .orderBy(desc(schema.uptimeCheck.checkedAt))
    .limit(200);
  return { envs, checks };
}

/** Archivos de la Biblioteca vinculados al sitio. */
export async function siteFiles(ctx: Ctx, siteId: string) {
  return getDb()
    .select({
      id: schema.file.id,
      name: schema.file.name,
      mime: schema.file.mime,
      size: schema.file.size,
      kind: schema.file.kind,
      description: schema.file.description,
      createdAt: schema.file.createdAt,
      url: schema.file.url,
    })
    .from(schema.file)
    .where(and(eq(schema.file.siteId, siteId), scoped(schema.file, ctx)))
    .orderBy(desc(schema.file.createdAt))
    .limit(200);
}

/** Nota de documentación + productos propios instalados en el sitio. */
export async function siteDocs(ctx: Ctx, site: { id: string; docsNoteId: string | null }) {
  const db = getDb();
  const [note] = site.docsNoteId
    ? await db
        .select({ id: schema.note.id, title: schema.note.title, bodyMd: schema.note.bodyMd, updatedAt: schema.note.updatedAt })
        .from(schema.note)
        .where(and(eq(schema.note.id, site.docsNoteId), scoped(schema.note, ctx)))
    : [];
  const installs = await db
    .select({
      id: schema.installation.id,
      productName: schema.ownProduct.name,
      productKind: schema.ownProduct.kind,
      version: schema.ownProductVersion.version,
      installedAt: schema.installation.installedAt,
      status: schema.installation.status,
    })
    .from(schema.installation)
    .innerJoin(schema.ownProduct, and(eq(schema.ownProduct.id, schema.installation.productId), eq(schema.ownProduct.workspaceId, schema.installation.workspaceId)))
    .leftJoin(
      schema.ownProductVersion,
      and(eq(schema.ownProductVersion.id, schema.installation.versionId), eq(schema.ownProductVersion.workspaceId, schema.installation.workspaceId)),
    )
    .where(and(eq(schema.installation.siteId, site.id), scoped(schema.installation, ctx)))
    .orderBy(asc(schema.ownProduct.name));
  return { note: note ?? null, installs };
}

/** Datos del PDF del briefing. */
export async function briefDocument(ctx: Ctx, siteId: string) {
  const site = await getSite(ctx, siteId);
  if (!site) return null;
  const [brief, [w]] = await Promise.all([
    getBrief(ctx, siteId),
    getDb().select({ settings: schema.workspace.settings }).from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId)),
  ]);
  return { site, brief, brand: brandFromSettings(w?.settings) };
}
