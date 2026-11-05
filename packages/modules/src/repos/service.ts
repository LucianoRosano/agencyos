import { assertCan, type Ctx, formatDate, notFound, systemCtx, todayAR, validation, zOptText, zOptUuid, zRequired } from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { schema, type Tx } from "@agencyos/db";
import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { assertOwned, getDb, scoped } from "../shared/db";
import { type GhRepo, type GitHubClient, getGitHubClient, type InstallationApi, verifyWebhookSignature, webhookSecret } from "./github";
import { ACTION_KINDS, ACTION_ORDER, type ActionKind, createRepoAction, type PlannedAction, planActionsFor } from "./plan";
import {
  appendReadmeSections,
  buildRepoName,
  type CheckKey,
  type CheckResult,
  claudeMdTemplate,
  clientSlug,
  clientTopic,
  evaluateRepo,
  gitignoreMissing,
  healthScore,
  inferLinks,
  isRepoScope,
  nameFollowsConvention,
  proposeDescription,
  REPO_SCOPES,
  SCOPE_LABEL,
  type RepoFacts,
  type RepoScope,
  readmeMissingSections,
  readmeTemplate,
  slugPart,
  TOPIC_STACKS,
  TOPIC_TYPES,
} from "./standard";

/**
 * Repositorios (M11, docs/15). Permisos (no hay recurso propio en core/permissions):
 * - leer → project:read · sincronizar, generar plan y vincular → project:update
 * - conectar la App, aprobar y rechazar planes → settings:manage (+ reautenticación en la Server Action)
 * - Claude por MCP propone planes con approval:create (propose:*); nunca los aprueba.
 */

const T = schema.repository;

function gh(): GitHubClient {
  const c = getGitHubClient();
  if (!c) throw validation("GitHub no está conectado: falta crear la GitHub App (Repositorios → Crear la GitHub App).");
  return c;
}

const githubCtx = (workspaceId: string): Ctx => ({ ...systemCtx(workspaceId), actor: { type: "system", id: null, name: "GitHub" } });

/** Actividad adicional en el proyecto vinculado (sin duplicar el evento de dominio). */
async function projectActivity(t: Tx, ctx: Ctx, projectId: string | null, verb: string, summary: string) {
  if (!projectId) return;
  await t.insert(schema.activity).values({
    workspaceId: ctx.workspaceId,
    entityType: "project",
    entityId: projectId,
    verb,
    summary,
    actorType: ctx.actor.type,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
  });
}

// --- Instalación ---

export async function connectInstallation(ctx: Ctx, installationId: number) {
  assertCan(ctx, "manage", "settings");
  if (ctx.actor.type !== "user") throw validation("Solo una persona puede conectar GitHub.");
  const id = z.coerce.number().int().positive("Instalación inválida").parse(installationId);
  const inst = await gh().getInstallation(id); // verifica que la instalación sea de NUESTRA App
  const row = await getDb().transaction(async (t) => {
    const [existing] = await t
      .select()
      .from(schema.githubInstallation)
      .where(and(eq(schema.githubInstallation.workspaceId, ctx.workspaceId), eq(schema.githubInstallation.installationId, id)));
    const values = { accountLogin: inst.account.login, accountType: inst.account.type, permissions: inst.permissions, archivedAt: null, deletedAt: null };
    const [r] = existing
      ? await t.update(schema.githubInstallation).set(values).where(eq(schema.githubInstallation.id, existing.id)).returning()
      : await t
          .insert(schema.githubInstallation)
          .values({ ...values, workspaceId: ctx.workspaceId, createdBy: ctx.userId, installationId: id })
          .returning();
    if (!r) throw new Error("No se pudo guardar la instalación");
    await recordEvent(t, ctx, {
      type: "repos.github_conectado",
      entityType: "repository",
      summary: `Conectó GitHub (${inst.account.login})`,
      payload: { installationId: id },
    });
    await audit(t, ctx, { action: "github.installation.connect", targetType: "github_installation", targetId: r.id, after: { installationId: id, account: inst.account.login } });
    return r;
  });
  return row;
}

// --- Sincronización ---

type LinkCandidates = Parameters<typeof inferLinks>[1];

async function linkCandidates(ctx: Ctx): Promise<LinkCandidates> {
  const db = getDb();
  const [clients, projects, products] = await Promise.all([
    db.select({ id: schema.client.id, name: schema.client.name, tradeName: schema.client.tradeName }).from(schema.client).where(scoped(schema.client, ctx)),
    db.select({ id: schema.project.id, name: schema.project.name, clientId: schema.project.clientId }).from(schema.project).where(scoped(schema.project, ctx)),
    db
      .select({ id: schema.ownProduct.id, name: schema.ownProduct.name, repositoryId: schema.ownProduct.repositoryId })
      .from(schema.ownProduct)
      .where(scoped(schema.ownProduct, ctx)),
  ]);
  return { clients, projects, products };
}

/** Slug y etiqueta del "dueño" del repositorio (cliente o producto) para la convención. */
function ownerOf(row: { scope: string | null; clientId: string | null; productId: string | null; topics: string[] }, c: LinkCandidates) {
  if (row.scope === "prod" && row.productId) {
    const p = c.products.find((x) => x.id === row.productId);
    if (p) return { slug: slugPart(p.name), label: p.name };
  }
  const topic = clientTopic(row.topics);
  if (row.clientId) {
    const cl = c.clients.find((x) => x.id === row.clientId);
    if (cl) return { slug: row.scope === "cli" ? (topic ?? clientSlug(cl)) : null, label: cl.tradeName || cl.name };
  }
  if (row.scope === "cli" && topic) return { slug: topic, label: topic.charAt(0).toUpperCase() + topic.slice(1) };
  return { slug: null, label: isRepoScope(row.scope) ? SCOPE_LABEL[row.scope] : null };
}

async function collectFacts(api: InstallationApi, r: GhRepo, scope: RepoScope | null, ownerSlug: string | null): Promise<RepoFacts> {
  const [readme, claudeMd, gitignore, wfPaths, latestRun, branchProtection, vulnerabilityAlerts] = await Promise.all([
    api.getFile(r.fullName, "README.md"),
    api.getFile(r.fullName, "CLAUDE.md"),
    api.getFile(r.fullName, ".gitignore"),
    api.listDir(r.fullName, ".github/workflows"),
    api.latestRun(r.fullName, r.defaultBranch),
    api.branchProtection(r.fullName, r.defaultBranch),
    api.vulnerabilityAlerts(r.fullName),
  ]);
  const yml = wfPaths.filter((p) => /\.ya?ml$/i.test(p)).slice(0, 10);
  const workflows = await Promise.all(yml.map(async (path) => ({ path, content: (await api.getFile(r.fullName, path)) ?? "" })));
  return {
    name: r.name,
    description: r.description,
    topics: r.topics,
    archived: r.archived,
    isTemplate: r.isTemplate,
    defaultBranch: r.defaultBranch,
    pushedAt: r.pushedAt ? new Date(r.pushedAt) : null,
    scope,
    ownerLabel: ownerSlug,
    readme,
    claudeMd,
    gitignore,
    workflows,
    latestRun,
    branchProtection,
    vulnerabilityAlerts,
  };
}

async function writeChecks(t: Tx, ctx: Ctx, repositoryId: string, checks: CheckResult[]) {
  const now = new Date();
  for (const c of checks) {
    await t
      .insert(schema.repoCheck)
      .values({ workspaceId: ctx.workspaceId, repositoryId, checkKey: c.key, status: c.status, details: { message: c.message, ...(c.details ?? {}) }, checkedAt: now })
      .onConflictDoUpdate({
        target: [schema.repoCheck.repositoryId, schema.repoCheck.checkKey],
        set: { status: c.status, details: { message: c.message, ...(c.details ?? {}) }, checkedAt: now },
      });
  }
}

/** Sincroniza UN repositorio de GitHub: upsert + inferencia + checks + puntaje. */
async function syncOne(ctx: Ctx, api: InstallationApi, installationId: number, r: GhRepo, cand: LinkCandidates) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(T)
    .where(and(eq(T.workspaceId, ctx.workspaceId), eq(T.githubId, r.id)));
  const inf = inferLinks({ id: existing?.id, name: r.name, topics: r.topics }, cand);
  const scope: RepoScope | null = inf.scope ?? (isRepoScope(existing?.scope) ? existing.scope : null);
  const clientId = existing?.clientId ?? (inf.client?.sure ? inf.client.id : null);
  const productId = existing?.productId ?? (inf.product?.sure ? inf.product.id : null);
  const owner = ownerOf({ scope, clientId, productId, topics: r.topics }, cand);
  const facts = await collectFacts(api, r, scope, owner.slug);
  const checks = evaluateRepo(facts);
  const score = healthScore(checks);
  return db.transaction(async (t) => {
    const values = {
      installationId,
      fullName: r.fullName,
      name: r.name,
      description: r.description,
      private: r.private,
      defaultBranch: r.defaultBranch,
      topics: r.topics,
      archived: r.archived,
      pushedAt: r.pushedAt ? new Date(r.pushedAt) : null,
      language: r.language,
      scope,
      clientId,
      productId,
      healthScore: score,
      lastSyncedAt: new Date(),
      archivedAt: null,
    };
    const [row] = existing
      ? await t.update(T).set(values).where(eq(T.id, existing.id)).returning()
      : await t
          .insert(T)
          .values({ ...values, workspaceId: ctx.workspaceId, createdBy: ctx.userId, githubId: r.id })
          .returning();
    if (!row) throw new Error("No se pudo guardar el repositorio");
    await writeChecks(t, ctx, row.id, checks);
    return { row, isNew: !existing, score };
  });
}

export async function syncInstallation(ctx: Ctx, inst: typeof schema.githubInstallation.$inferSelect) {
  const api = gh().installation(inst.installationId);
  const repos = await api.listRepos();
  const cand = await linkCandidates(ctx);
  let created = 0;
  let red = 0;
  for (const r of repos) {
    const res = await syncOne(ctx, api, inst.installationId, r, cand);
    if (res.isNew) created++;
    if (res.score < 70) red++;
  }
  const ids = repos.map((r) => r.id);
  await getDb().transaction(async (t) => {
    // Los que ya no están en la instalación se ocultan (nunca se borran).
    await t
      .update(T)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(T.workspaceId, ctx.workspaceId),
          eq(T.installationId, inst.installationId),
          isNull(T.archivedAt),
          ids.length ? notInArray(T.githubId, ids) : sql`true`,
        ),
      );
    await t.update(schema.githubInstallation).set({ lastSyncedAt: new Date() }).where(eq(schema.githubInstallation.id, inst.id));
    await recordEvent(t, ctx, {
      type: "repos.sincronizado",
      entityType: "repository",
      summary: `Sincronizó ${repos.length} repositorios de ${inst.accountLogin}${created ? ` (${created} nuevos)` : ""}`,
      payload: { total: repos.length, created, red },
    });
  });
  return { total: repos.length, created, red };
}

export async function syncWorkspace(ctx: Ctx) {
  assertCan(ctx, "update", "project");
  const insts = await getDb().select().from(schema.githubInstallation).where(scoped(schema.githubInstallation, ctx));
  if (!insts.length) throw validation("No hay una instalación de GitHub conectada.");
  const out = { total: 0, created: 0, red: 0 };
  for (const i of insts) {
    const r = await syncInstallation(ctx, i);
    out.total += r.total;
    out.created += r.created;
    out.red += r.red;
  }
  return out;
}

/** Resincroniza un repositorio por nombre completo (webhooks y después de ejecutar un plan). */
async function syncRepoByName(ctx: Ctx, installationId: number, fullName: string) {
  const api = gh().installation(installationId);
  const r = await api.getRepo(fullName);
  if (!r) return null;
  return syncOne(ctx, api, installationId, r, await linkCandidates(ctx));
}

/** Job diario (04:00 ART): sincroniza todas las instalaciones de todos los workspaces. */
export async function dailySyncAll() {
  if (!getGitHubClient()) return { skipped: "sin GitHub App" };
  const insts = await getDb()
    .select()
    .from(schema.githubInstallation)
    .where(and(isNull(schema.githubInstallation.deletedAt), isNull(schema.githubInstallation.archivedAt)));
  const results: Record<string, unknown>[] = [];
  for (const i of insts) {
    try {
      results.push({ installationId: i.installationId, ...(await syncInstallation(systemCtx(i.workspaceId), i)) });
    } catch (e) {
      results.push({ installationId: i.installationId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

// --- Vínculos ---

export const linksInput = z.object({
  scope: z.preprocess((v) => (v === "" ? undefined : v), z.enum(REPO_SCOPES, { error: "Alcance inválido" }).optional()),
  clientId: zOptUuid,
  projectId: zOptUuid,
  productId: zOptUuid,
  siteId: zOptUuid,
});

/** Recalcula el check de nombre (depende del alcance y del dueño) sin llamar a GitHub, y el puntaje. */
async function refreshNameCheck(t: Tx, ctx: Ctx, repoId: string) {
  const [row] = await t.select().from(T).where(eq(T.id, repoId));
  if (!row) return;
  const cand = await linkCandidates(ctx);
  const owner = ownerOf(row, cand);
  const name = evaluateRepo({
    name: row.name,
    description: row.description,
    topics: row.topics,
    archived: row.archived,
    defaultBranch: row.defaultBranch,
    pushedAt: row.pushedAt,
    scope: isRepoScope(row.scope) ? row.scope : null,
    ownerLabel: owner.slug,
    readme: null,
    claudeMd: null,
    gitignore: null,
    workflows: [],
    latestRun: null,
    branchProtection: "unavailable",
    vulnerabilityAlerts: null,
  }).find((c) => c.key === "nombre");
  if (name) await writeChecks(t, ctx, repoId, [name]);
  const all = await t.select().from(schema.repoCheck).where(eq(schema.repoCheck.repositoryId, repoId));
  await t
    .update(T)
    .set({ healthScore: healthScore(all.map((c) => ({ key: c.checkKey as CheckKey, status: c.status as CheckResult["status"] }))) })
    .where(eq(T.id, repoId));
}

export async function updateLinks(ctx: Ctx, repoId: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = linksInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [before] = await t
      .select()
      .from(T)
      .where(and(eq(T.id, repoId), scoped(T, ctx)));
    if (!before) throw notFound("El repositorio");
    await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
    await assertOwned(t, ctx, schema.project, input.projectId, "El proyecto");
    await assertOwned(t, ctx, schema.ownProduct, input.productId, "El producto");
    await assertOwned(t, ctx, schema.site, input.siteId, "El sitio");
    const [row] = await t
      .update(T)
      .set({ scope: input.scope ?? null, clientId: input.clientId ?? null, projectId: input.projectId ?? null, productId: input.productId ?? null })
      .where(eq(T.id, repoId))
      .returning();
    if (!row) throw notFound("El repositorio");
    if (input.productId) {
      await t
        .update(schema.ownProduct)
        .set({ repositoryId: repoId })
        .where(and(eq(schema.ownProduct.id, input.productId), scoped(schema.ownProduct, ctx), isNull(schema.ownProduct.repositoryId)));
    }
    // Sitio: no hay columna en `repository` → vínculo genérico (tabla link).
    await t
      .delete(schema.link)
      .where(
        and(
          eq(schema.link.workspaceId, ctx.workspaceId),
          eq(schema.link.fromType, "repository"),
          eq(schema.link.fromId, repoId),
          eq(schema.link.toType, "site"),
          eq(schema.link.kind, "repo_site"),
        ),
      );
    if (input.siteId)
      await t.insert(schema.link).values({
        workspaceId: ctx.workspaceId,
        fromType: "repository",
        fromId: repoId,
        toType: "site",
        toId: input.siteId,
        kind: "repo_site",
        createdBy: ctx.userId,
      });
    await refreshNameCheck(t, ctx, repoId);
    await recordEvent(t, ctx, { type: "repo.vinculos_actualizados", entityType: "repository", entityId: repoId, summary: `Actualizó los vínculos de ${row.fullName}` });
    if (row.projectId && row.projectId !== before.projectId)
      await projectActivity(t, ctx, row.projectId, "repo.vinculado", `Vinculó el repositorio ${row.fullName}`);
    return row;
  });
}

// --- Planes ---

const planInput = z.object({ repositoryIds: z.array(z.string().uuid("Identificador inválido")).max(500).optional() });

async function insertPlan(t: Tx, ctx: Ctx, name: string, actions: PlannedAction[], summaryMd: string) {
  const [plan] = await t
    .insert(schema.repoPlan)
    .values({
      workspaceId: ctx.workspaceId,
      createdBy: ctx.userId,
      name,
      status: "pending_approval",
      createdByType: ctx.actor.type === "agent" ? "agent" : "user",
      createdById: ctx.actor.id,
      summaryMd,
    })
    .returning();
  if (!plan) throw new Error("No se pudo crear el plan");
  await t.insert(schema.repoPlanAction).values(
    actions.map((a) => ({
      workspaceId: ctx.workspaceId,
      createdBy: ctx.userId,
      planId: plan.id,
      repositoryId: a.repositoryId,
      kind: a.kind,
      params: a.params,
      risk: a.risk,
    })),
  );
  await recordEvent(t, ctx, {
    type: "repos.plan_generado",
    entityType: "repository",
    summary: `${ctx.actor.type === "agent" ? "Claude propuso" : "Generó"} el plan «${name}» (${actions.length} acciones)`,
    payload: { planId: plan.id },
  });
  await audit(t, ctx, { action: "repo_plan.create", targetType: "repo_plan", targetId: plan.id, after: { actions: actions.length } });
  return plan;
}

/** "Generar plan": determinístico, a partir de los checks guardados. Queda pendiente de aprobación. */
export async function generatePlan(ctx: Ctx, raw: unknown = {}) {
  if (ctx.actor.type === "agent") assertCan(ctx, "create", "approval");
  else assertCan(ctx, "update", "project");
  const input = planInput.parse(raw);
  const db = getDb();
  const where = [scoped(T, ctx)];
  if (input.repositoryIds?.length) where.push(inArray(T.id, input.repositoryIds));
  const repos = await db
    .select()
    .from(T)
    .where(and(...where))
    .orderBy(asc(T.name));
  if (input.repositoryIds?.length && repos.length !== new Set(input.repositoryIds).size) throw notFound("El repositorio");
  if (!repos.length) throw validation("No hay repositorios sincronizados.");
  const checks = await db
    .select()
    .from(schema.repoCheck)
    .where(
      and(
        eq(schema.repoCheck.workspaceId, ctx.workspaceId),
        inArray(
          schema.repoCheck.repositoryId,
          repos.map((r) => r.id),
        ),
      ),
    );
  const cand = await linkCandidates(ctx);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? null;
  const actions: PlannedAction[] = [];
  for (const r of repos) {
    const rc = checks.filter((c) => c.repositoryId === r.id);
    const owner = ownerOf(r, cand);
    actions.push(
      ...planActionsFor({
        id: r.id,
        name: r.name,
        fullName: r.fullName,
        description: r.description,
        topics: r.topics,
        language: r.language,
        archived: r.archived,
        pushedAt: r.pushedAt,
        defaultBranch: r.defaultBranch,
        scope: isRepoScope(r.scope) ? r.scope : null,
        checks: Object.fromEntries(rc.map((c) => [c.checkKey, { status: c.status as CheckResult["status"], details: c.details as Record<string, unknown> }])),
        owner,
        agencyosUrl: appUrl ? `${appUrl}/repositorios/${r.id}` : null,
      }),
    );
  }
  if (!actions.length) throw validation("No hay desvíos que corregir: todo cumple el estándar.");
  const touched = new Set(actions.map((a) => a.repositoryId));
  const name = `Plan de organización · ${formatDate(todayAR())}`;
  const summaryMd = `${actions.length} acciones sobre ${touched.size} ${touched.size === 1 ? "repositorio" : "repositorios"}. Los archivos se agregan siempre vía PR; nunca se borra, se cambia la visibilidad ni se hace force-push.`;
  return db.transaction((t) => insertPlan(t, ctx, name, actions, summaryMd));
}

export const createRepoInput = z.object({
  templateId: z.string({ error: "Elegí una plantilla" }).uuid("Elegí una plantilla"),
  scope: z.enum(REPO_SCOPES, { error: "Alcance inválido" }),
  tech: zOptText(30),
  name: zRequired(60, "El nombre"),
  what: zRequired(200, "Qué es"),
  type: z.preprocess((v) => (v === "" ? undefined : v), z.enum(TOPIC_TYPES).optional()),
  stack: z.preprocess((v) => (v === "" ? undefined : v), z.enum(TOPIC_STACKS).optional()),
});

/** Nombre propuesto por la convención para un repositorio nuevo de un proyecto. */
export async function previewRepoName(ctx: Ctx, projectId: string, raw: { scope: string; tech?: string; name: string }) {
  const [p] = await getDb()
    .select({ p: schema.project, c: schema.client })
    .from(schema.project)
    .leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId)))
    .where(and(eq(schema.project.id, projectId), scoped(schema.project, ctx)));
  if (!p) throw notFound("El proyecto");
  const scope = isRepoScope(raw.scope) ? raw.scope : "int";
  return buildRepoName({ scope, owner: scope === "cli" && p.c ? clientSlug(p.c) : null, tech: raw.tech, name: raw.name || p.p.name });
}

/** "Crear repositorio" desde un proyecto: arma un plan con una acción create_repo que se ejecuta al aprobarlo. */
export async function createRepoPlan(ctx: Ctx, projectId: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = createRepoInput.parse(raw);
  const db = getDb();
  return db.transaction(async (t) => {
    const [p] = await t
      .select({ p: schema.project, c: schema.client })
      .from(schema.project)
      .leftJoin(schema.client, and(eq(schema.client.id, schema.project.clientId), eq(schema.client.workspaceId, schema.project.workspaceId)))
      .where(and(eq(schema.project.id, projectId), scoped(schema.project, ctx)));
    if (!p) throw notFound("El proyecto");
    if (input.scope === "cli" && !p.c) throw validation("Un repositorio cli-* necesita que el proyecto tenga cliente.", { scope: "El proyecto no tiene cliente" });
    const [tpl] = await t
      .select()
      .from(T)
      .where(and(eq(T.id, input.templateId), scoped(T, ctx)));
    if (!tpl || tpl.scope !== "tpl" || !tpl.installationId) throw validation("Elegí una plantilla tpl-*", { templateId: "Plantilla inválida" });
    const [inst] = await t
      .select()
      .from(schema.githubInstallation)
      .where(and(scoped(schema.githubInstallation, ctx), eq(schema.githubInstallation.installationId, tpl.installationId)));
    if (!inst) throw validation("La instalación de GitHub de la plantilla no está conectada.");
    const owner = input.scope === "cli" && p.c ? clientSlug(p.c) : null;
    const name = buildRepoName({ scope: input.scope, owner, tech: input.tech, name: input.name });
    if (!nameFollowsConvention(name)) throw validation("El nombre no cumple la convención", { name: "Revisá el nombre" });
    const [dup] = await t
      .select({ id: T.id })
      .from(T)
      .where(and(eq(T.workspaceId, ctx.workspaceId), sql`lower(${T.name}) = ${name}`));
    if (dup) throw validation(`Ya existe un repositorio ${name}`, { name: "Ya existe" });
    const topics = [
      `alcance-${input.scope}`,
      ...(owner ? [`cliente-${owner}`] : []),
      ...(input.type ? [`tipo-${input.type}`] : []),
      ...(input.stack ? [`stack-${input.stack}`] : []),
      "estado-activo",
    ];
    const ownerLabel = p.c ? p.c.tradeName || p.c.name : null;
    const description = proposeDescription({ description: input.what, owner: ownerLabel ?? p.p.name, name, topics, language: null });
    const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? null;
    const fctx = {
      repoName: name,
      title: p.p.name,
      ownerLabel,
      agencyosUrl: appUrl ? `${appUrl}/proyectos/${p.p.id}` : null,
      stacks: input.stack ? [input.stack] : [],
      scope: input.scope,
      description,
    };
    const action = createRepoAction({
      installationId: inst.installationId,
      owner: inst.accountLogin,
      templateFullName: tpl.fullName,
      name,
      description,
      topics,
      projectId: p.p.id,
      clientId: p.p.clientId,
      files: [
        { path: "README.md", content: readmeTemplate(fctx) },
        { path: "CLAUDE.md", content: claudeMdTemplate(fctx) },
      ],
    });
    return insertPlan(t, ctx, `Crear ${name}`, [action], `Repositorio nuevo para el proyecto «${p.p.name}», desde la plantilla ${tpl.fullName}.`);
  });
}

const approveInput = z.object({ actionIds: z.array(z.string().uuid()).min(1, "Elegí al menos una acción") });

/**
 * Aprobar un plan. La reautenticación (verifyPassword) la hace la Server Action antes de llamar acá.
 * Las acciones no elegidas quedan "skipped". La ejecución la hace el worker (executeApprovedPlans).
 */
export async function approvePlan(ctx: Ctx, planId: string, raw: unknown) {
  assertCan(ctx, "manage", "settings");
  if (ctx.actor.type !== "user") throw validation("Solo una persona puede aprobar un plan.");
  const input = approveInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [plan] = await t
      .select()
      .from(schema.repoPlan)
      .where(and(eq(schema.repoPlan.id, planId), scoped(schema.repoPlan, ctx)))
      .for("update");
    if (!plan) throw notFound("El plan");
    if (plan.status !== "pending_approval") throw validation("Ese plan ya fue decidido.");
    const actions = await t.select().from(schema.repoPlanAction).where(and(eq(schema.repoPlanAction.planId, planId), scoped(schema.repoPlanAction, ctx)));
    const chosen = new Set(input.actionIds);
    if (![...chosen].every((id) => actions.some((a) => a.id === id))) throw notFound("La acción");
    const skipped = actions.filter((a) => !chosen.has(a.id)).map((a) => a.id);
    if (skipped.length) await t.update(schema.repoPlanAction).set({ status: "skipped" }).where(inArray(schema.repoPlanAction.id, skipped));
    const [row] = await t
      .update(schema.repoPlan)
      .set({ status: "approved", approvedAt: new Date(), approvedBy: ctx.userId })
      .where(eq(schema.repoPlan.id, planId))
      .returning();
    await recordEvent(t, ctx, {
      type: "repos.plan_aprobado",
      entityType: "repository",
      summary: `Aprobó el plan «${plan.name}» (${chosen.size} de ${actions.length} acciones)`,
      payload: { planId },
    });
    await audit(t, ctx, {
      action: "repo_plan.approve",
      targetType: "repo_plan",
      targetId: planId,
      after: { approved: [...chosen], skipped, reauth: true },
    });
    return row;
  });
}

export async function rejectPlan(ctx: Ctx, planId: string) {
  assertCan(ctx, "manage", "settings");
  if (ctx.actor.type !== "user") throw validation("Solo una persona puede rechazar un plan.");
  return getDb().transaction(async (t) => {
    const [plan] = await t
      .select()
      .from(schema.repoPlan)
      .where(and(eq(schema.repoPlan.id, planId), scoped(schema.repoPlan, ctx)));
    if (!plan) throw notFound("El plan");
    if (plan.status !== "pending_approval") throw validation("Ese plan ya fue decidido.");
    await t.update(schema.repoPlanAction).set({ status: "skipped" }).where(eq(schema.repoPlanAction.planId, planId));
    const [row] = await t.update(schema.repoPlan).set({ status: "rejected" }).where(eq(schema.repoPlan.id, planId)).returning();
    await recordEvent(t, ctx, { type: "repos.plan_rechazado", entityType: "repository", summary: `Rechazó el plan «${plan.name}»`, payload: { planId } });
    await audit(t, ctx, { action: "repo_plan.reject", targetType: "repo_plan", targetId: planId });
    return row;
  });
}

// --- Ejecución (worker) ---

type ActionRow = typeof schema.repoPlanAction.$inferSelect;
type RepoRow = typeof schema.repository.$inferSelect;

const BRANCH_PREFIX = "agencyos/estandar";

async function runAction(api: InstallationApi, repo: RepoRow | null, a: ActionRow, group: ActionRow[]): Promise<Record<string, unknown>> {
  const p = a.params as Record<string, unknown>;
  if (!(ACTION_KINDS as readonly string[]).includes(a.kind)) throw new Error(`Acción no permitida: ${a.kind}`);
  const kind = a.kind as ActionKind;
  if (kind !== "create_repo" && !repo) throw new Error("El repositorio ya no existe en AGENCYOS");
  const fn = repo?.fullName ?? "";
  switch (kind) {
    case "rename": {
      const to = String(p.to ?? "");
      if (!nameFollowsConvention(to)) throw new Error("El nombre propuesto no cumple la convención");
      const r = await api.updateRepo(fn, { name: to });
      return { from: repo?.name, to: r.name, fullName: r.fullName };
    }
    case "set_topics": {
      const topics = (p.to as string[]).filter((x) => /^[a-z0-9][a-z0-9-]{0,49}$/.test(x)).slice(0, 20);
      return { topics: await api.replaceTopics(fn, topics) };
    }
    case "set_description": {
      const r = await api.updateRepo(fn, { description: String(p.to ?? "").slice(0, 350) });
      return { description: r.description };
    }
    case "add_file": {
      // Todos los add_file del repositorio van en UN solo PR (se ejecuta con el primero del grupo).
      const files: { path: string; content: string }[] = [];
      for (const g of group) {
        const gp = g.params as Record<string, unknown>;
        const path = String(gp.path);
        if (gp.mode === "complete") {
          const cur = (await api.getFile(fn, path)) ?? "";
          if (path === "README.md") files.push({ path, content: appendReadmeSections(cur, readmeMissingSections(cur)) });
          else if (path === ".gitignore") {
            const missing = gitignoreMissing(cur);
            files.push({ path, content: `${cur.replace(/\s*$/, "")}\n\n# Patrones sensibles (estándar AGENCYOS)\n${missing.join("\n")}\n` });
          }
        } else files.push({ path, content: String(gp.content ?? "") });
      }
      const pr = await api.openFilesPr(fn, {
        base: repo?.defaultBranch ?? "main",
        branch: `${BRANCH_PREFIX}-${todayAR()}`,
        title: "chore: archivos estándar (AGENCYOS)",
        body: `Plan aprobado en AGENCYOS. Archivos: ${files.map((f) => `\`${f.path}\``).join(", ")}.\n\nNo se escribe en la rama por defecto: revisar y mergear.`,
        files,
      });
      return { pr: pr.number, url: pr.url, files: files.map((f) => f.path) };
    }
    case "enable_security":
      await api.enableSecurity(fn);
      return { vulnerabilityAlerts: true };
    case "protect_branch": {
      const branch = String(p.branch ?? repo?.defaultBranch ?? "main");
      await api.protectBranch(fn, branch, (p.requiredChecks as string[]) ?? []);
      return { branch, protected: true };
    }
    case "archive":
      await api.updateRepo(fn, { archived: true });
      return { archived: true };
    case "create_repo": {
      const r = await api.createFromTemplate({
        templateFullName: String(p.templateFullName),
        owner: String(p.owner),
        name: String(p.name),
        description: String(p.description),
      });
      await api.replaceTopics(r.fullName, (p.topics as string[]) ?? []);
      const files = (p.files as { path: string; content: string }[]) ?? [];
      const pr = files.length
        ? await api.openFilesPr(r.fullName, { base: r.defaultBranch, branch: `${BRANCH_PREFIX}-inicial`, title: "docs: README y CLAUDE.md del proyecto (AGENCYOS)", body: "Creado desde AGENCYOS.", files })
        : null;
      return { fullName: r.fullName, githubId: r.id, private: r.private, pr: pr?.number ?? null, url: pr?.url ?? null };
    }
  }
}

/** Ejecuta un plan aprobado con el token de instalación. Idempotente: solo toma planes en "approved". */
export async function executePlan(planId: string) {
  const db = getDb();
  const [plan] = await db
    .update(schema.repoPlan)
    .set({ status: "executing" })
    .where(and(eq(schema.repoPlan.id, planId), eq(schema.repoPlan.status, "approved")))
    .returning();
  if (!plan) return null;
  const ctx = { ...systemCtx(plan.workspaceId), actor: { type: "system" as const, id: null, name: "Worker de repositorios" } };
  const actions = (
    await db
      .select()
      .from(schema.repoPlanAction)
      .where(and(eq(schema.repoPlanAction.planId, planId), eq(schema.repoPlanAction.status, "pending")))
  ).sort((a, b) => (ACTION_ORDER[a.kind as ActionKind] ?? 99) - (ACTION_ORDER[b.kind as ActionKind] ?? 99) || a.createdAt.getTime() - b.createdAt.getTime());
  const touched = new Map<string, { installationId: number; repoId: string }>();
  let failed = 0;
  const handledFiles = new Set<string>();
  for (const a of actions) {
    if (handledFiles.has(a.id)) continue;
    const [repo] = a.repositoryId ? await db.select().from(T).where(and(eq(T.id, a.repositoryId), eq(T.workspaceId, plan.workspaceId))) : [null];
    const installationId = repo?.installationId ?? Number((a.params as Record<string, unknown>).installationId ?? 0);
    const group = a.kind === "add_file" ? actions.filter((x) => x.kind === "add_file" && x.repositoryId === a.repositoryId) : [a];
    let status: "done" | "failed" = "done";
    let result: Record<string, unknown>;
    try {
      if (!installationId) throw new Error("Sin instalación de GitHub");
      result = await runAction(gh().installation(installationId), repo ?? null, a, group);
    } catch (e) {
      status = "failed";
      failed += group.length;
      result = { error: e instanceof Error ? e.message : String(e) };
    }
    await db.transaction(async (t) => {
      for (const g of group) {
        handledFiles.add(g.id);
        await t.update(schema.repoPlanAction).set({ status, result, executedAt: new Date() }).where(eq(schema.repoPlanAction.id, g.id));
        await audit(t, ctx, {
          action: `github.${g.kind}`,
          targetType: "repo_plan_action",
          targetId: g.id,
          before: { repository: repo?.fullName ?? null, params: { ...(g.params as object), content: undefined } },
          after: { status, ...result },
        });
      }
      if (status === "done" && a.kind === "rename" && repo) {
        await t
          .update(T)
          .set({ name: String(result.to), fullName: String(result.fullName) })
          .where(eq(T.id, repo.id));
      }
      let repoId = repo?.id ?? null;
      if (status === "done" && a.kind === "create_repo") {
        const p = a.params as Record<string, unknown>;
        const [created] = await t
          .insert(T)
          .values({
            workspaceId: plan.workspaceId,
            githubId: Number(result.githubId),
            installationId,
            fullName: String(result.fullName),
            name: String(p.name),
            description: String(p.description),
            private: true,
            topics: (p.topics as string[]) ?? [],
            scope: String(p.name).split("-")[0] ?? null,
            projectId: (p.projectId as string) ?? null,
            clientId: (p.clientId as string | null) ?? null,
          })
          .onConflictDoNothing()
          .returning();
        repoId = created?.id ?? null;
        if (created) {
          await t.update(schema.repoPlanAction).set({ repositoryId: created.id }).where(eq(schema.repoPlanAction.id, a.id));
          await projectActivity(t, ctx, created.projectId, "repo.creado", `Se creó el repositorio ${created.fullName}`);
        }
      }
      const label = { rename: "Renombró", set_topics: "Actualizó los topics de", set_description: "Actualizó la descripción de", add_file: "Abrió un PR con archivos estándar en", enable_security: "Activó la seguridad de", protect_branch: "Protegió la rama de", archive: "Archivó", create_repo: "Creó" }[a.kind as ActionKind];
      const target = String(result.fullName ?? repo?.fullName ?? (a.params as Record<string, unknown>).name ?? "");
      await recordEvent(t, ctx, {
        type: status === "done" ? "repo.accion_ejecutada" : "repo.accion_fallida",
        entityType: "repository",
        entityId: repoId,
        summary: status === "done" ? `${label} ${target}` : `Falló «${a.kind}» en ${target}: ${String(result.error)}`,
        payload: { planId, actionId: a.id, kind: a.kind },
      });
      if (repoId) touched.set(repoId, { installationId, repoId });
    });
  }
  // Recalcular los checks de lo que se tocó.
  for (const { installationId, repoId } of touched.values()) {
    const [r] = await db.select().from(T).where(eq(T.id, repoId));
    if (r) await syncRepoByName(ctx, installationId, r.fullName).catch(() => null);
  }
  const final = failed ? "failed" : "done";
  await db.transaction(async (t) => {
    await t.update(schema.repoPlan).set({ status: final }).where(eq(schema.repoPlan.id, planId));
    await recordEvent(t, ctx, {
      type: "repos.plan_ejecutado",
      entityType: "repository",
      summary: failed ? `Ejecutó el plan «${plan.name}» con ${failed} acciones fallidas` : `Ejecutó el plan «${plan.name}»`,
      payload: { planId, failed },
    });
    await audit(t, ctx, { action: "repo_plan.executed", targetType: "repo_plan", targetId: planId, after: { status: final, failed } });
  });
  return { planId, status: final, failed };
}

/** Job del worker: ejecuta los planes aprobados pendientes (de todos los workspaces). */
export async function executeApprovedPlans() {
  if (!getGitHubClient()) return { skipped: "sin GitHub App" };
  const plans = await getDb()
    .select({ id: schema.repoPlan.id })
    .from(schema.repoPlan)
    .where(and(eq(schema.repoPlan.status, "approved"), isNull(schema.repoPlan.deletedAt)))
    .orderBy(asc(schema.repoPlan.approvedAt))
    .limit(20);
  const out = [];
  for (const p of plans) out.push(await executePlan(p.id));
  return out.filter(Boolean);
}

// --- Webhooks ---

export type WebhookResult = { status: number; body: string };
type J = Record<string, unknown>;

const isClaudePr = (pr: J) => {
  const user = (pr.user as J | undefined) ?? {};
  const login = String(user.login ?? "");
  const slug = process.env.GITHUB_APP_SLUG ?? "agencyos";
  const head = String((pr.head as J | undefined)?.ref ?? "");
  return login === `${slug}[bot]` || head.startsWith("agencyos/") || head.startsWith("claude/");
};

/**
 * Webhook de GitHub: HMAC X-Hub-Signature-256 en tiempo constante → idempotencia por X-GitHub-Delivery
 * (repo_event.delivery_id único) → evento de dominio. El cuerpo se procesa solo si la firma es válida.
 */
export async function handleWebhook(h: { event: string | null; deliveryId: string | null; signature: string | null; rawBody: string }): Promise<WebhookResult> {
  const secret = webhookSecret();
  if (!secret) return { status: 503, body: "GitHub App no configurada" };
  if (!verifyWebhookSignature(secret, h.rawBody, h.signature)) return { status: 401, body: "Firma inválida" };
  if (!h.deliveryId || !/^[A-Za-z0-9-]{1,100}$/.test(h.deliveryId) || !h.event || !/^[a-z_]{1,50}$/.test(h.event)) return { status: 400, body: "Encabezados inválidos" };
  let payload: J;
  try {
    payload = JSON.parse(h.rawBody) as J;
  } catch {
    return { status: 400, body: "JSON inválido" };
  }
  if (h.event === "ping") return { status: 200, body: "pong" };
  const installationId = Number((payload.installation as J | undefined)?.id ?? 0);
  if (!installationId) return { status: 202, body: "Sin instalación" };
  const db = getDb();
  const [inst] = await db
    .select()
    .from(schema.githubInstallation)
    .where(
      and(
        eq(schema.githubInstallation.installationId, installationId),
        isNull(schema.githubInstallation.deletedAt),
      ),
    )
    // Una instalación pertenece a un workspace; si se conectó en más de uno, manda la última conexión.
    .orderBy(desc(schema.githubInstallation.updatedAt))
    .limit(1);
  if (!inst) return { status: 202, body: "Instalación desconocida" };
  const ctx = githubCtx(inst.workspaceId);
  const action = String(payload.action ?? "");
  const ghRepo = payload.repository as J | undefined;

  // Repositorio afectado (si no existe todavía, se sincroniza).
  let repo: RepoRow | null = null;
  if (ghRepo?.id) {
    const found = await db
      .select()
      .from(T)
      .where(and(eq(T.workspaceId, inst.workspaceId), eq(T.githubId, Number(ghRepo.id))));
    repo = found[0] ?? null;
    if (!repo && getGitHubClient() && !(h.event === "repository" && action === "deleted")) {
      repo = (await syncRepoByName(ctx, installationId, String(ghRepo.full_name)).catch(() => null))?.row ?? null;
    }
  }

  const kind =
    h.event === "push" ? "push" : h.event === "pull_request" ? "pr" : h.event === "release" ? "release" : h.event.startsWith("installation") ? "installation" : h.event;
  const excerpt: J = { event: h.event, action };
  if (h.event === "push") {
    const commits = (payload.commits as J[] | undefined) ?? [];
    Object.assign(excerpt, {
      ref: payload.ref,
      commits: commits.length,
      pusher: (payload.pusher as J | undefined)?.name,
      message: String((payload.head_commit as J | undefined)?.message ?? "").slice(0, 200),
    });
  } else if (h.event === "pull_request") {
    const pr = (payload.pull_request as J) ?? {};
    Object.assign(excerpt, {
      number: pr.number,
      title: String(pr.title ?? "").slice(0, 200),
      url: pr.html_url,
      user: (pr.user as J | undefined)?.login,
      merged: Boolean(pr.merged),
      claude: isClaudePr(pr),
    });
  } else if (h.event === "release") {
    const rel = (payload.release as J) ?? {};
    Object.assign(excerpt, { tag: rel.tag_name, name: rel.name, url: rel.html_url, prerelease: Boolean(rel.prerelease) });
  }

  const releaseWork: { productId: string; tag: string; body: string } | null =
    h.event === "release" && action === "published" && repo && !(excerpt.prerelease as boolean)
      ? await (async () => {
          const [prod] = await db
            .select()
            .from(schema.ownProduct)
            .where(
              and(
                scoped(schema.ownProduct, ctx),
                repo?.productId ? eq(schema.ownProduct.id, repo.productId) : eq(schema.ownProduct.repositoryId, repo?.id ?? ""),
              ),
            )
            .limit(1);
          return prod ? { productId: prod.id, tag: String(excerpt.tag ?? ""), body: String(((payload.release as J) ?? {}).body ?? "").slice(0, 20000) } : null;
        })()
      : null;

  const processed = await db.transaction(async (t) => {
    const [ev] = await t
      .insert(schema.repoEvent)
      .values({ workspaceId: inst.workspaceId, repositoryId: repo?.id ?? null, kind, payloadExcerpt: excerpt, deliveryId: h.deliveryId })
      .onConflictDoNothing({ target: schema.repoEvent.deliveryId })
      .returning();
    if (!ev) return false; // entrega duplicada: no se reprocesa
    const name = repo?.fullName ?? String(ghRepo?.full_name ?? "");
    if (h.event === "installation") {
      if (["deleted", "suspend"].includes(action))
        await t.update(schema.githubInstallation).set({ archivedAt: new Date() }).where(eq(schema.githubInstallation.id, inst.id));
      if (action === "unsuspend") await t.update(schema.githubInstallation).set({ archivedAt: null }).where(eq(schema.githubInstallation.id, inst.id));
      await recordEvent(t, ctx, { type: `repos.instalacion_${action || "evento"}`, entityType: "repository", summary: `GitHub: instalación ${action}` });
    } else if (h.event === "repository" && repo) {
      if (action === "deleted") await t.update(T).set({ archivedAt: new Date() }).where(eq(T.id, repo.id));
      await recordEvent(t, ctx, { type: "repo.actualizado", entityType: "repository", entityId: repo.id, summary: `GitHub: ${name} ${action}` });
    } else if (h.event === "push" && repo) {
      await t.update(T).set({ pushedAt: new Date() }).where(eq(T.id, repo.id));
      const branch = String(excerpt.ref ?? "").replace("refs/heads/", "");
      const summary = `Push a ${branch} en ${name} (${excerpt.commits} commits)`;
      await recordEvent(t, ctx, { type: "repo.push", entityType: "repository", entityId: repo.id, summary, payload: { branch, commits: excerpt.commits } });
      await projectActivity(t, ctx, repo.projectId, "repo.push", summary);
    } else if (h.event === "pull_request" && repo) {
      const type = ["opened", "reopened"].includes(action) ? "repo.pr_abierto" : action === "closed" ? (excerpt.merged ? "repo.pr_mergeado" : "repo.pr_cerrado") : null;
      if (type) {
        const verb = type === "repo.pr_abierto" ? "Se abrió" : type === "repo.pr_mergeado" ? "Se mergeó" : "Se cerró";
        const summary = `${verb} el PR #${excerpt.number} «${excerpt.title}» en ${name}${excerpt.claude ? " (Claude)" : ""}`;
        await recordEvent(t, ctx, { type, entityType: "repository", entityId: repo.id, summary, payload: { number: excerpt.number, claude: excerpt.claude } });
        await projectActivity(t, ctx, repo.projectId, type, summary);
      }
    } else if (h.event === "release" && repo && action === "published") {
      const summary = `Release ${excerpt.tag} publicado en ${name}`;
      await recordEvent(t, ctx, { type: "repo.release_publicado", entityType: "repository", entityId: repo.id, summary, payload: { tag: excerpt.tag } });
      await projectActivity(t, ctx, repo.projectId, "repo.release_publicado", summary);
      if (releaseWork) await registerProductRelease(t, ctx, releaseWork);
    }
    return true;
  });
  if (!processed) return { status: 200, body: "Entrega duplicada (ya procesada)" };

  // Recalcular checks después de cambios que los afectan (mejor esfuerzo; no falla el webhook).
  if (repo && getGitHubClient() && (h.event === "repository" ? action !== "deleted" : h.event === "push" && String(excerpt.ref) === `refs/heads/${repo.defaultBranch}`)) {
    await syncRepoByName(ctx, installationId, String(ghRepo?.full_name ?? repo.fullName)).catch((e) => console.error("[github] resync", e));
  }
  if (h.event === "installation_repositories") {
    await syncInstallation(ctx, inst).catch((e) => console.error("[github] sync", e));
  }
  return { status: 200, body: "ok" };
}

/** Release de un repositorio vinculado a un producto propio → own_product_version + tarea por instalación activa. */
async function registerProductRelease(t: Tx, ctx: Ctx, w: { productId: string; tag: string; body: string }) {
  const [prod] = await t.select().from(schema.ownProduct).where(eq(schema.ownProduct.id, w.productId));
  if (!prod || !w.tag) return;
  const [exists] = await t
    .select({ id: schema.ownProductVersion.id })
    .from(schema.ownProductVersion)
    .where(and(scoped(schema.ownProductVersion, ctx), eq(schema.ownProductVersion.productId, prod.id), eq(schema.ownProductVersion.version, w.tag)));
  if (exists) return;
  const [ver] = await t
    .insert(schema.ownProductVersion)
    .values({ workspaceId: ctx.workspaceId, productId: prod.id, version: w.tag, changelogMd: w.body || null })
    .returning();
  const installs = await t
    .select({ i: schema.installation, clientName: schema.client.name, siteName: schema.site.name })
    .from(schema.installation)
    .leftJoin(schema.client, and(eq(schema.client.id, schema.installation.clientId), eq(schema.client.workspaceId, schema.installation.workspaceId)))
    .leftJoin(schema.site, and(eq(schema.site.id, schema.installation.siteId), eq(schema.site.workspaceId, schema.installation.workspaceId)))
    .where(and(scoped(schema.installation, ctx), eq(schema.installation.productId, prod.id), eq(schema.installation.status, "active")));
  const spaces = await t.select().from(schema.space).where(scoped(schema.space, ctx)).orderBy(asc(schema.space.sort));
  const space = spaces.find((s) => s.kind === "agency") ?? spaces[0];
  if (space && installs.length) {
    await t.insert(schema.task).values(
      installs.map(({ i, clientName, siteName }) => ({
        workspaceId: ctx.workspaceId,
        title: `Actualizar ${prod.name} a ${w.tag} en ${siteName ?? clientName ?? "la instalación"}`.slice(0, 300),
        descriptionMd: `Release ${w.tag} de ${prod.name}.${i.configRefMd ? `\n\nConfiguración: ${i.configRefMd}` : ""}`,
        spaceId: space.id,
        priority: 2,
        dueDate: todayAR(),
      })),
    );
  }
  await recordEvent(t, ctx, {
    type: "producto.version_publicada",
    entityType: "own_product",
    entityId: prod.id,
    summary: `Nueva versión ${w.tag} de ${prod.name}${installs.length ? ` · ${installs.length} ${installs.length === 1 ? "instalación" : "instalaciones"} para actualizar` : ""}`,
    payload: { versionId: ver?.id, tasks: installs.length },
  });
}
