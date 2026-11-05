import { addDays, addMonths, assertCan, type Ctx, conflict, notFound, todayAR, validation, zBool, zInt, zOptText, zOptUuid, zUuid } from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { type DbOrTx, schema } from "@agencyos/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { encryptSecret } from "../shared/crypto";
import { assertOwned, getDb, scoped } from "../shared/db";
import { createTask } from "../tasks/service";
import { issueDef, type SeoSeverity } from "./catalog";
import { configFrom, sameOrigin } from "./config";
import { findGoogleKeyRow, GOOGLE_KEY_KIND, GOOGLE_PROVIDER } from "./google-key";
import { normalizeUrl } from "./score";

/**
 * SEO Auditor (M07). Permisos: auditorías y programaciones usan el recurso `project` (trabajo de la agencia);
 * la API key de Google usa `settings` (administración).
 * La auditoría se encola acá (status `queued`) y la ejecuta el worker (`seo-audit`, cada minuto; ver jobs.ts).
 */

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** URL http/https absoluta, sin credenciales. La validación anti-SSRF (DNS, redes privadas, puertos) se hace en cada pedido del worker. */
export const zAuditUrl = z.preprocess(
  (v) => {
    const s = emptyToUndef(v);
    if (typeof s === "string" && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s.trim())) return `https://${s.trim()}`;
    return typeof s === "string" ? s.trim() : s;
  },
  z
    .string({ error: "La URL es obligatoria" })
    .max(2000, "URL demasiado larga")
    .refine((v) => {
      try {
        const u = new URL(v);
        const hostOk = u.hostname.includes(".") || u.hostname === "localhost" || u.hostname.startsWith("[");
        return (u.protocol === "http:" || u.protocol === "https:") && hostOk && !u.username && !u.password;
      } catch {
        return false;
      }
    }, "Ingresá una URL válida que empiece con http:// o https://"),
);

const zLines = z.preprocess(
  (v) =>
    typeof v === "string"
      ? v
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : v,
  z.array(z.string().url("Cada URL de Lighthouse debe ser absoluta")).max(5, "Máximo 5 URLs para Lighthouse").default([]),
);

export const auditInput = z.object({
  siteId: zOptUuid,
  rootUrl: z.preprocess(emptyToUndef, zAuditUrl.optional()),
  maxPages: z.preprocess(emptyToUndef, zInt(1, 2000).default(300)),
  maxDepth: z.preprocess(emptyToUndef, zInt(0, 50).default(10)),
  checkExternal: z.preprocess((v) => (v === undefined ? true : v), zBool),
  lighthouseUrls: zLines,
});

async function siteFor(t: DbOrTx, ctx: Ctx, siteId: string | undefined | null) {
  if (!siteId) return null;
  const [s] = await t
    .select()
    .from(schema.site)
    .where(and(scoped(schema.site, ctx), eq(schema.site.id, siteId)));
  if (!s) throw notFound("El sitio");
  return s;
}

const hostOf = (u: string) => new URL(u).host;

async function insertAudit(
  t: DbOrTx,
  ctx: Ctx,
  v: { rootUrl: string; siteId: string | null; config: Record<string, unknown> },
  summary: string,
  createdBy: string | null = ctx.userId,
) {
  const active = await t
    .select({ id: schema.seoAudit.id, rootUrl: schema.seoAudit.rootUrl })
    .from(schema.seoAudit)
    .where(and(scoped(schema.seoAudit, ctx), inArray(schema.seoAudit.status, ["queued", "running"])));
  if (active.some((a) => sameOrigin(a.rootUrl, v.rootUrl)))
    throw conflict("Ya hay una auditoría en cola o en curso para este sitio. Esperá a que termine o cancelala.");
  const [row] = await t
    .insert(schema.seoAudit)
    .values({ workspaceId: ctx.workspaceId, createdBy, rootUrl: v.rootUrl, siteId: v.siteId, config: v.config, status: "queued", summary: {} })
    .returning();
  if (!row) throw new Error("No se pudo crear la auditoría");
  await recordEvent(t, ctx, { type: "auditoria.encolada", entityType: "seo_audit", entityId: row.id, summary, payload: { rootUrl: row.rootUrl } });
  return row;
}

/** Nueva auditoría: URL raíz (o el sitio elegido), límites y URLs para Lighthouse. Queda en cola para el worker. */
export async function startAudit(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "project");
  const input = auditInput.parse(raw);
  return getDb().transaction(async (t) => {
    const site = await siteFor(t, ctx, input.siteId);
    const url = input.rootUrl ?? site?.prodUrl ?? null;
    if (!url) throw validation("Ingresá la URL a auditar o elegí un sitio con URL de producción", { rootUrl: "La URL es obligatoria" });
    const rootUrl = normalizeUrl(zAuditUrl.parse(url));
    if (!rootUrl) throw validation("URL inválida", { rootUrl: "URL inválida" });
    const lighthouseUrls = input.lighthouseUrls.map((u) => normalizeUrl(u)).filter((u): u is string => Boolean(u));
    if (lighthouseUrls.some((u) => !sameOrigin(u, rootUrl)))
      throw validation("Las URLs de Lighthouse deben ser del mismo sitio", { lighthouseUrls: "Solo URLs del sitio auditado" });
    const config = configFrom({ maxPages: input.maxPages, maxDepth: input.maxDepth, checkExternal: input.checkExternal, lighthouseUrls });
    return insertAudit(t, ctx, { rootUrl, siteId: site?.id ?? null, config }, `Encoló la auditoría SEO de ${hostOf(rootUrl)}`);
  });
}

async function getOwnedAudit(t: DbOrTx, ctx: Ctx, id: string) {
  const parsed = zUuid.safeParse(id);
  if (!parsed.success) throw notFound("La auditoría");
  const [a] = await t
    .select()
    .from(schema.seoAudit)
    .where(and(scoped(schema.seoAudit, ctx), eq(schema.seoAudit.id, id)));
  if (!a) throw notFound("La auditoría");
  return a;
}

/** Repite una auditoría con la misma URL y configuración (para comparar después). */
export async function reaudit(ctx: Ctx, id: string) {
  assertCan(ctx, "create", "project");
  return getDb().transaction(async (t) => {
    const a = await getOwnedAudit(t, ctx, id);
    const { scheduleId: _s, ...config } = configFrom(a.config);
    return insertAudit(t, ctx, { rootUrl: a.rootUrl, siteId: a.siteId, config }, `Volvió a auditar ${hostOf(a.rootUrl)}`);
  });
}

/** Cancela una auditoría en cola o en curso: el worker la frena en segundos y guarda lo rastreado hasta ahí. */
export async function cancelAudit(ctx: Ctx, id: string) {
  assertCan(ctx, "update", "project");
  return getDb().transaction(async (t) => {
    const a = await getOwnedAudit(t, ctx, id);
    if (a.status !== "queued" && a.status !== "running") throw validation("Solo se puede cancelar una auditoría en cola o en curso");
    const [row] = await t
      .update(schema.seoAudit)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(and(eq(schema.seoAudit.id, a.id), inArray(schema.seoAudit.status, ["queued", "running"])))
      .returning();
    if (!row) throw conflict("La auditoría ya terminó");
    await recordEvent(t, ctx, {
      type: "auditoria.cancelada",
      entityType: "seo_audit",
      entityId: a.id,
      summary: `Canceló la auditoría SEO de ${hostOf(a.rootUrl)}`,
    });
    return row;
  });
}

// — Tareas desde problemas —

const SEVERITY_PRIORITY: Record<SeoSeverity, number> = { critical: 1, high: 2, medium: 3, low: 4 };

export const tasksFromIssuesInput = z.object({
  auditId: zUuid,
  code: z.string().min(1).max(80).optional(),
  issueId: zOptUuid,
  mode: z.enum(["group", "each"]).default("group"),
  projectId: zOptUuid,
});

/**
 * Convierte un problema (issueId) o un grupo (code) en tareas: una para el grupo (con la lista de URLs) o una por URL (máx. 50).
 * Proyecto: el elegido o, si no, el proyecto del sitio auditado. Marca los problemas con la tarea creada.
 */
export async function createTasksFromIssues(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "task");
  const input = tasksFromIssuesInput.parse(raw);
  if (!input.code && !input.issueId) throw validation("Elegí un problema o un grupo");
  return getDb().transaction(async (t) => {
    const a = await getOwnedAudit(t, ctx, input.auditId);
    await assertOwned(t, ctx, schema.project, input.projectId, "El proyecto");
    const site = a.siteId ? await siteFor(t, ctx, a.siteId).catch(() => null) : null;
    let projectId = input.projectId ?? null;
    if (!projectId && site?.projectId) {
      const [p] = await t
        .select({ id: schema.project.id })
        .from(schema.project)
        .where(and(scoped(schema.project, ctx), eq(schema.project.id, site.projectId)));
      projectId = p?.id ?? null;
    }
    const where = [eq(schema.seoIssue.workspaceId, ctx.workspaceId), eq(schema.seoIssue.auditId, a.id)];
    if (input.issueId) where.push(eq(schema.seoIssue.id, input.issueId));
    else if (input.code) where.push(eq(schema.seoIssue.code, input.code));
    const issues = await t
      .select()
      .from(schema.seoIssue)
      .where(and(...where))
      .orderBy(schema.seoIssue.url);
    if (!issues.length) throw notFound("El problema");
    const first = issues[0] as (typeof issues)[number];
    const def = issueDef(first.code);
    const priority = SEVERITY_PRIORITY[first.severity as SeoSeverity] ?? 3;
    const link = `/seo/${a.id}/problemas`;
    const body = (urls: (string | null)[]) =>
      [
        `**${def.title}** · auditoría SEO de ${hostOf(a.rootUrl)}`,
        "",
        `**Por qué importa:** ${def.why}`,
        "",
        `**Cómo corregirlo:** ${def.fix}`,
        "",
        urls.filter(Boolean).length ? "**URLs afectadas:**" : "**Afecta a todo el sitio.**",
        ...urls
          .filter(Boolean)
          .slice(0, 100)
          .map((u) => `- [ ] ${u}`),
        urls.length > 100 ? `- … y ${urls.length - 100} más (ver la auditoría)` : "",
        "",
        `[Ver en la auditoría](${link})`,
      ]
        .filter((l) => l !== undefined)
        .join("\n");
    const created: { id: string; title: string }[] = [];
    if (input.mode === "each" && !input.issueId) {
      if (issues.length > 50) throw validation("Son más de 50 URLs: creá una tarea para el grupo");
      for (const i of issues) {
        const task = await createTask(
          ctx,
          {
            title: `SEO · ${def.title}${i.url ? ` · ${shortUrl(i.url)}` : ""}`.slice(0, 300),
            descriptionMd: body([i.url]),
            projectId: projectId ?? undefined,
            priority,
          },
          t,
        );
        await t.update(schema.seoIssue).set({ taskId: task.id }).where(eq(schema.seoIssue.id, i.id));
        created.push({ id: task.id, title: task.title });
      }
    } else {
      const n = issues.filter((i) => i.url).length;
      const title = `SEO · ${def.title}${n > 1 ? ` (${n} URLs)` : n === 1 && first.url ? ` · ${shortUrl(first.url)}` : ""}`.slice(0, 300);
      const task = await createTask(ctx, { title, descriptionMd: body(issues.map((i) => i.url)), projectId: projectId ?? undefined, priority }, t);
      await t
        .update(schema.seoIssue)
        .set({ taskId: task.id })
        .where(
          inArray(
            schema.seoIssue.id,
            issues.map((i) => i.id),
          ),
        );
      created.push({ id: task.id, title: task.title });
    }
    await recordEvent(t, ctx, {
      type: "auditoria.tareas_creadas",
      entityType: "seo_audit",
      entityId: a.id,
      summary: `Creó ${created.length} tarea${created.length === 1 ? "" : "s"} desde «${def.title}»`,
      payload: { code: first.code, tasks: created.map((c) => c.id), projectId },
    });
    return { created, projectId };
  });
}

function shortUrl(u: string) {
  try {
    const x = new URL(u);
    return `${x.pathname}${x.search}`.slice(0, 80) || "/";
  } catch {
    return u.slice(0, 80);
  }
}

// — API key de Google (cifrada) —

export const googleKeyInput = z.object({
  apiKey: z
    .string({ error: "Pegá la API key" })
    .trim()
    .min(20, "La API key parece incompleta")
    .max(200, "La API key es demasiado larga")
    .regex(/^[A-Za-z0-9_-]+$/, "La API key solo tiene letras, números, - y _"),
});

/** Guarda (o reemplaza) la API key cifrada. Nunca se devuelve: solo se muestran los últimos 4 caracteres. */
export async function saveGoogleApiKey(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "manage", "settings");
  const { apiKey } = googleKeyInput.parse(raw);
  const secretEnc = encryptSecret(apiKey);
  const last4 = apiKey.slice(-4);
  const existing = await findGoogleKeyRow(ctx.workspaceId);
  return getDb().transaction(async (t) => {
    let id: string;
    if (existing) {
      await t
        .update(schema.integration)
        .set({ secretEnc, status: "active", lastError: null, config: { ...(existing.config as Record<string, unknown>), kind: GOOGLE_KEY_KIND, last4 } })
        .where(and(eq(schema.integration.id, existing.id), eq(schema.integration.workspaceId, ctx.workspaceId)));
      id = existing.id;
    } else {
      const [row] = await t
        .insert(schema.integration)
        .values({
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
          provider: GOOGLE_PROVIDER,
          name: "PageSpeed Insights y CrUX",
          config: { kind: GOOGLE_KEY_KIND, last4 },
          secretEnc,
          status: "active",
        })
        .returning({ id: schema.integration.id });
      if (!row) throw new Error("No se pudo guardar la API key");
      id = row.id;
    }
    await audit(t, ctx, {
      action: "integration.secret_saved",
      targetType: "integration",
      targetId: id,
      after: { provider: GOOGLE_PROVIDER, kind: GOOGLE_KEY_KIND },
    });
    await recordEvent(t, ctx, { type: "integracion.configurada", entityType: "integration", entityId: id, summary: "Configuró la API key de Google para SEO" });
    return { id, last4 };
  });
}

export async function removeGoogleApiKey(ctx: Ctx) {
  assertCan(ctx, "manage", "settings");
  const existing = await findGoogleKeyRow(ctx.workspaceId);
  if (!existing) throw notFound("La API key");
  return getDb().transaction(async (t) => {
    await t
      .update(schema.integration)
      .set({ secretEnc: null, status: "disabled", config: { kind: GOOGLE_KEY_KIND } })
      .where(and(eq(schema.integration.id, existing.id), eq(schema.integration.workspaceId, ctx.workspaceId)));
    await audit(t, ctx, { action: "integration.secret_removed", targetType: "integration", targetId: existing.id });
    await recordEvent(t, ctx, {
      type: "integracion.eliminada",
      entityType: "integration",
      entityId: existing.id,
      summary: "Quitó la API key de Google para SEO",
    });
    return { id: existing.id };
  });
}

// — Auditorías programadas —

export const scheduleInput = z.object({
  siteId: zOptUuid,
  rootUrl: z.preprocess(emptyToUndef, zAuditUrl.optional()),
  frequency: z.enum(["weekly", "monthly"], { error: "Elegí la frecuencia" }).default("monthly"),
  maxPages: z.preprocess(emptyToUndef, zInt(1, 2000).default(300)),
  maxDepth: z.preprocess(emptyToUndef, zInt(0, 50).default(10)),
  firstRunOn: z.preprocess(
    emptyToUndef,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
      .optional(),
  ),
  note: zOptText(300),
});

export const nextRunAfter = (date: string, frequency: string) => (frequency === "weekly" ? addDays(date, 7) : addMonths(date, 1));

export async function createSchedule(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "project");
  const input = scheduleInput.parse(raw);
  return getDb().transaction(async (t) => {
    const site = await siteFor(t, ctx, input.siteId);
    const url = input.rootUrl ?? site?.prodUrl ?? null;
    if (!url) throw validation("Ingresá la URL o elegí un sitio con URL de producción", { rootUrl: "La URL es obligatoria" });
    const rootUrl = normalizeUrl(zAuditUrl.parse(url));
    if (!rootUrl) throw validation("URL inválida", { rootUrl: "URL inválida" });
    const today = todayAR();
    if (input.firstRunOn && input.firstRunOn < today) throw validation("La primera fecha no puede ser pasada", { firstRunOn: "Elegí hoy o una fecha futura" });
    const [row] = await t
      .insert(schema.seoSchedule)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        siteId: site?.id ?? null,
        rootUrl,
        frequency: input.frequency,
        config: { ...configFrom({ maxPages: input.maxPages, maxDepth: input.maxDepth }), note: input.note ?? null },
        active: true,
        nextRunOn: input.firstRunOn ?? today,
      })
      .returning();
    if (!row) throw new Error("No se pudo programar");
    await recordEvent(t, ctx, {
      type: "auditoria.programada",
      entityType: "seo_schedule",
      entityId: row.id,
      summary: `Programó una auditoría SEO ${input.frequency === "weekly" ? "semanal" : "mensual"} de ${hostOf(rootUrl)}`,
    });
    return row;
  });
}

export async function setScheduleActive(ctx: Ctx, id: string, active: boolean) {
  assertCan(ctx, "update", "project");
  if (!zUuid.safeParse(id).success) throw notFound("La programación");
  return getDb().transaction(async (t) => {
    const [s] = await t
      .select()
      .from(schema.seoSchedule)
      .where(and(scoped(schema.seoSchedule, ctx), eq(schema.seoSchedule.id, id)));
    if (!s) throw notFound("La programación");
    const today = todayAR();
    const [row] = await t
      .update(schema.seoSchedule)
      .set({ active, nextRunOn: active && (!s.nextRunOn || s.nextRunOn < today) ? today : s.nextRunOn })
      .where(eq(schema.seoSchedule.id, s.id))
      .returning();
    await recordEvent(t, ctx, {
      type: active ? "auditoria.programacion_activada" : "auditoria.programacion_pausada",
      entityType: "seo_schedule",
      entityId: s.id,
      summary: `${active ? "Reanudó" : "Pausó"} la auditoría programada de ${hostOf(s.rootUrl)}`,
    });
    return row;
  });
}

/**
 * Job diario: encola las auditorías programadas que tocan hoy (o quedaron atrasadas) y corre la próxima fecha.
 * Si ya hay una auditoría en curso del mismo origen, la deja para el día siguiente.
 */
export async function enqueueDueSchedules(today = todayAR()) {
  const db = getDb();
  const due = await db
    .select()
    .from(schema.seoSchedule)
    .where(and(eq(schema.seoSchedule.active, true), isNull(schema.seoSchedule.deletedAt), isNull(schema.seoSchedule.archivedAt)));
  let queued = 0;
  for (const s of due) {
    if (!s.nextRunOn || s.nextRunOn > today) continue;
    const ctx: Ctx = { workspaceId: s.workspaceId, userId: null, role: "owner", actor: { type: "system", id: null, name: "Sistema" } };
    try {
      await db.transaction(async (t) => {
        const cfg = configFrom(s.config);
        await insertAudit(
          t,
          ctx,
          { rootUrl: s.rootUrl, siteId: s.siteId, config: { ...cfg, scheduleId: s.id } },
          `Auditoría SEO programada de ${hostOf(s.rootUrl)}`,
          null,
        );
        await t
          .update(schema.seoSchedule)
          .set({ nextRunOn: nextRunAfter(today, s.frequency) })
          .where(eq(schema.seoSchedule.id, s.id));
      });
      queued++;
    } catch (e) {
      if (!(e instanceof Error && /en cola o en curso/.test(e.message))) throw e;
      await db
        .update(schema.seoSchedule)
        .set({ nextRunOn: addDays(today, 1) })
        .where(eq(schema.seoSchedule.id, s.id));
    }
  }
  return queued;
}
