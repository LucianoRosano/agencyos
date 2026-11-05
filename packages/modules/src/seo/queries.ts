import { assertCan, type Ctx, todayAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, desc, eq, ilike, inArray, isNotNull, or, type SQL, sql } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";
import { brandFromSettings } from "../quotes/queries";
import { type IssueDef, issueDef, SEO_CATEGORIES, SEO_LABELS, SEO_SEVERITIES, type SeoCategory, type SeoSeverity } from "./catalog";
import { type AuditSummary, sameOrigin } from "./config";
import { findGoogleKeyRow, type GoogleKeyConfig } from "./google-key";
import { CRUX_DAILY_QUOTA, PSI_DAILY_QUOTA, QUOTA_WARN_RATIO } from "./google";

export { SEO_CATEGORIES, SEO_LABELS, SEO_SEVERITIES };
export type { AuditSummary };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};

export async function listAudits(ctx: Ctx, opts: { q?: string; status?: string; limit?: number } = {}) {
  assertCan(ctx, "read", "project");
  const where: SQL[] = [scoped(schema.seoAudit, ctx)];
  if (opts.q?.trim()) where.push(ilike(schema.seoAudit.rootUrl, `%${opts.q.trim().replace(/[%_]/g, "\\$&")}%`));
  if (opts.status) where.push(eq(schema.seoAudit.status, opts.status));
  const rows = await getDb()
    .select({ a: schema.seoAudit, siteName: schema.site.name })
    .from(schema.seoAudit)
    .leftJoin(schema.site, and(eq(schema.site.id, schema.seoAudit.siteId), eq(schema.site.workspaceId, schema.seoAudit.workspaceId)))
    .where(and(...where))
    .orderBy(desc(schema.seoAudit.createdAt))
    .limit(opts.limit ?? 200);
  // delta contra la auditoría completada anterior del mismo origen
  return rows.map((r, i) => {
    const prev = rows.slice(i + 1).find((x) => x.a.status === "completed" && x.a.score !== null && sameOrigin(x.a.rootUrl, r.a.rootUrl));
    const s = r.a.summary as Partial<AuditSummary>;
    return {
      id: r.a.id,
      rootUrl: r.a.rootUrl,
      host: hostOf(r.a.rootUrl),
      siteName: r.siteName,
      status: r.a.status,
      score: r.a.score,
      pagesCrawled: r.a.pagesCrawled,
      maxPages: Number((r.a.config as { maxPages?: number }).maxPages ?? 300),
      createdAt: r.a.createdAt,
      finishedAt: r.a.finishedAt,
      error: r.a.error,
      counts: s.counts ?? null,
      delta: r.a.status === "completed" && r.a.score !== null && prev?.a.score !== null && prev ? r.a.score - (prev.a.score as number) : null,
    };
  });
}

export async function getAudit(ctx: Ctx, id: string) {
  assertCan(ctx, "read", "project");
  if (!UUID.test(id)) return null;
  const [r] = await getDb()
    .select({ a: schema.seoAudit, siteName: schema.site.name, siteProjectId: schema.site.projectId })
    .from(schema.seoAudit)
    .leftJoin(schema.site, and(eq(schema.site.id, schema.seoAudit.siteId), eq(schema.site.workspaceId, schema.seoAudit.workspaceId)))
    .where(and(scoped(schema.seoAudit, ctx), eq(schema.seoAudit.id, id)));
  if (!r) return null;
  let projectName: string | null = null;
  if (r.siteProjectId) {
    const [p] = await getDb()
      .select({ name: schema.project.name })
      .from(schema.project)
      .where(and(scoped(schema.project, ctx), eq(schema.project.id, r.siteProjectId)));
    projectName = p?.name ?? null;
  }
  return {
    audit: r.a,
    summary: r.a.summary as Partial<AuditSummary>,
    siteName: r.siteName,
    siteProjectId: projectName ? r.siteProjectId : null,
    siteProjectName: projectName,
    host: hostOf(r.a.rootUrl),
  };
}

export type IssueGroup = {
  code: string;
  def: IssueDef;
  category: SeoCategory;
  severity: SeoSeverity;
  count: number;
  withTask: number;
  items: { id: string; url: string | null; details: Record<string, unknown>; taskId: string | null }[];
};

/** Problemas agrupados por código, ordenados por severidad y cantidad. */
export async function listIssueGroups(ctx: Ctx, auditId: string, f: { category?: string; severity?: string } = {}): Promise<IssueGroup[]> {
  assertCan(ctx, "read", "project");
  if (!UUID.test(auditId)) return [];
  const where: SQL[] = [eq(schema.seoIssue.workspaceId, ctx.workspaceId), eq(schema.seoIssue.auditId, auditId)];
  if (f.category) where.push(eq(schema.seoIssue.category, f.category));
  if (f.severity) where.push(eq(schema.seoIssue.severity, f.severity));
  const rows = await getDb()
    .select()
    .from(schema.seoIssue)
    .where(and(...where))
    .orderBy(asc(schema.seoIssue.code), asc(schema.seoIssue.url));
  const groups = new Map<string, IssueGroup>();
  for (const r of rows) {
    const g = groups.get(r.code) ?? {
      code: r.code,
      def: issueDef(r.code),
      category: r.category as SeoCategory,
      severity: r.severity as SeoSeverity,
      count: 0,
      withTask: 0,
      items: [],
    };
    g.count++;
    if (r.taskId) g.withTask++;
    g.items.push({ id: r.id, url: r.url, details: r.details as Record<string, unknown>, taskId: r.taskId });
    groups.set(r.code, g);
  }
  return [...groups.values()].sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9) || b.count - a.count);
}

export const PAGE_FILTERS = ["todas", "errores", "redirecciones", "noindex", "lentas"] as const;

export async function listPages(ctx: Ctx, auditId: string, opts: { filter?: string; q?: string; offset?: number; limit?: number } = {}) {
  assertCan(ctx, "read", "project");
  if (!UUID.test(auditId)) return { rows: [], total: 0 };
  const p = schema.seoPage;
  const where: SQL[] = [eq(p.workspaceId, ctx.workspaceId), eq(p.auditId, auditId)];
  if (opts.filter === "errores") where.push(or(sql`${p.statusCode} >= 400`, sql`${p.statusCode} is null`) as SQL);
  if (opts.filter === "redirecciones") where.push(sql`${p.statusCode} between 300 and 399`);
  if (opts.filter === "noindex") where.push(and(eq(p.statusCode, 200), eq(p.indexable, false)) as SQL);
  if (opts.filter === "lentas") where.push(sql`${p.ttfbMs} > 800`);
  if (opts.q?.trim()) where.push(ilike(p.url, `%${opts.q.trim().replace(/[%_]/g, "\\$&")}%`));
  const db = getDb();
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(p)
    .where(and(...where));
  const rows = await db
    .select()
    .from(p)
    .where(and(...where))
    .orderBy(opts.filter === "lentas" ? desc(p.ttfbMs) : asc(p.depth), asc(p.url))
    .offset(opts.offset ?? 0)
    .limit(opts.limit ?? 100);
  return { rows, total: n };
}

export async function getPerformance(ctx: Ctx, auditId: string) {
  assertCan(ctx, "read", "project");
  if (!UUID.test(auditId)) return { lab: [], field: [], slowest: [] };
  const db = getDb();
  const [lab, field, slowest] = await Promise.all([
    db
      .select()
      .from(schema.seoLighthouse)
      .where(and(eq(schema.seoLighthouse.workspaceId, ctx.workspaceId), eq(schema.seoLighthouse.auditId, auditId)))
      .orderBy(asc(schema.seoLighthouse.url), desc(schema.seoLighthouse.strategy)),
    db
      .select()
      .from(schema.seoFieldMetrics)
      .where(and(eq(schema.seoFieldMetrics.workspaceId, ctx.workspaceId), eq(schema.seoFieldMetrics.auditId, auditId)))
      .orderBy(asc(schema.seoFieldMetrics.urlOrOrigin), desc(schema.seoFieldMetrics.formFactor)),
    db
      .select({ url: schema.seoPage.url, ttfbMs: schema.seoPage.ttfbMs, sizeBytes: schema.seoPage.sizeBytes })
      .from(schema.seoPage)
      .where(and(eq(schema.seoPage.workspaceId, ctx.workspaceId), eq(schema.seoPage.auditId, auditId), eq(schema.seoPage.statusCode, 200), isNotNull(schema.seoPage.ttfbMs)))
      .orderBy(desc(schema.seoPage.ttfbMs))
      .limit(10),
  ]);
  return { lab, field, slowest };
}

/** Auditorías completadas del mismo origen (para el selector de Comparar). */
export async function comparableAudits(ctx: Ctx, auditId: string) {
  const a = await getAudit(ctx, auditId);
  if (!a) return [];
  const rows = await getDb()
    .select({ id: schema.seoAudit.id, rootUrl: schema.seoAudit.rootUrl, score: schema.seoAudit.score, createdAt: schema.seoAudit.createdAt })
    .from(schema.seoAudit)
    .where(and(scoped(schema.seoAudit, ctx), eq(schema.seoAudit.status, "completed")))
    .orderBy(desc(schema.seoAudit.createdAt))
    .limit(200);
  return rows.filter((r) => r.id !== auditId && sameOrigin(r.rootUrl, a.audit.rootUrl));
}

export type CompareRow = { code: string; def: IssueDef; severity: SeoSeverity; category: SeoCategory; urls: (string | null)[] };

/**
 * Comparación entre dos auditorías del mismo sitio: `base` (anterior) contra `target` (actual).
 * Nuevos = en target y no en base; resueltos = en base y no en target; persistentes = en ambas (por fingerprint).
 */
export async function compareAudits(ctx: Ctx, targetId: string, baseId: string) {
  assertCan(ctx, "read", "project");
  const [t, b] = await Promise.all([getAudit(ctx, targetId), getAudit(ctx, baseId)]);
  if (!t || !b) return null;
  if (!sameOrigin(t.audit.rootUrl, b.audit.rootUrl)) return { error: "Solo se comparan auditorías del mismo sitio." as const };
  const rows = await getDb()
    .select({ auditId: schema.seoIssue.auditId, code: schema.seoIssue.code, url: schema.seoIssue.url, fp: schema.seoIssue.fingerprint, severity: schema.seoIssue.severity, category: schema.seoIssue.category })
    .from(schema.seoIssue)
    .where(and(eq(schema.seoIssue.workspaceId, ctx.workspaceId), inArray(schema.seoIssue.auditId, [t.audit.id, b.audit.id])));
  const inT = new Map(rows.filter((r) => r.auditId === t.audit.id).map((r) => [r.fp, r]));
  const inB = new Map(rows.filter((r) => r.auditId === b.audit.id).map((r) => [r.fp, r]));
  const group = (list: typeof rows): CompareRow[] => {
    const m = new Map<string, CompareRow>();
    for (const r of list) {
      const g = m.get(r.code) ?? { code: r.code, def: issueDef(r.code), severity: r.severity as SeoSeverity, category: r.category as SeoCategory, urls: [] };
      g.urls.push(r.url);
      m.set(r.code, g);
    }
    return [...m.values()].sort((x, y) => (SEV_ORDER[x.severity] ?? 9) - (SEV_ORDER[y.severity] ?? 9) || y.urls.length - x.urls.length);
  };
  const added = [...inT.values()].filter((r) => !inB.has(r.fp));
  const resolved = [...inB.values()].filter((r) => !inT.has(r.fp));
  const persistent = [...inT.values()].filter((r) => inB.has(r.fp));
  const catDelta = SEO_CATEGORIES.map((c) => {
    const tc = (t.summary.categories?.[c] as { score?: number; total?: number } | undefined) ?? {};
    const bc = (b.summary.categories?.[c] as { score?: number; total?: number } | undefined) ?? {};
    return { category: c, target: tc.score ?? null, base: bc.score ?? null, targetTotal: tc.total ?? 0, baseTotal: bc.total ?? 0 };
  });
  const sevDelta = SEO_SEVERITIES.map((s) => ({ severity: s, target: t.summary.counts?.[s] ?? 0, base: b.summary.counts?.[s] ?? 0 }));
  return {
    target: { id: t.audit.id, score: t.audit.score, createdAt: t.audit.createdAt, pages: t.audit.pagesCrawled },
    base: { id: b.audit.id, score: b.audit.score, createdAt: b.audit.createdAt, pages: b.audit.pagesCrawled },
    scoreDelta: t.audit.score !== null && b.audit.score !== null ? t.audit.score - b.audit.score : null,
    added: group(added),
    resolved: group(resolved),
    persistent: group(persistent),
    counts: { added: added.length, resolved: resolved.length, persistent: persistent.length },
    catDelta,
    sevDelta,
  };
}

export async function getGoogleKeyStatus(ctx: Ctx) {
  const row = await findGoogleKeyRow(ctx.workspaceId);
  const cfg = (row?.config ?? {}) as GoogleKeyConfig;
  const today = todayAR();
  const usage = cfg.usage?.date === today ? cfg.usage : { date: today, psi: 0, crux: 0 };
  const configured = Boolean(row?.secretEnc) && row?.status === "active";
  return {
    configured,
    last4: configured ? (cfg.last4 ?? null) : null,
    lastError: row?.lastError ?? null,
    lastOkAt: row?.lastOkAt ?? null,
    usage,
    quota: { psi: PSI_DAILY_QUOTA, crux: CRUX_DAILY_QUOTA },
    nearQuota: usage.psi >= PSI_DAILY_QUOTA * QUOTA_WARN_RATIO || usage.crux >= CRUX_DAILY_QUOTA * QUOTA_WARN_RATIO,
  };
}

export async function listSchedules(ctx: Ctx) {
  assertCan(ctx, "read", "project");
  const rows = await getDb()
    .select({ s: schema.seoSchedule, siteName: schema.site.name })
    .from(schema.seoSchedule)
    .leftJoin(schema.site, and(eq(schema.site.id, schema.seoSchedule.siteId), eq(schema.site.workspaceId, schema.seoSchedule.workspaceId)))
    .where(scoped(schema.seoSchedule, ctx))
    .orderBy(desc(schema.seoSchedule.active), asc(schema.seoSchedule.nextRunOn));
  return rows.map((r) => ({ ...r.s, siteName: r.siteName, host: hostOf(r.s.rootUrl) }));
}

/** Sitios con URL de producción para el selector de "Auditar". */
export async function siteOptions(ctx: Ctx) {
  const rows = await getDb()
    .select({ id: schema.site.id, name: schema.site.name, prodUrl: schema.site.prodUrl })
    .from(schema.site)
    .where(and(scoped(schema.site, ctx), isNotNull(schema.site.prodUrl)))
    .orderBy(asc(schema.site.name));
  return rows.filter((r) => r.prodUrl).map((r) => ({ value: r.id, label: `${r.name} · ${hostOf(r.prodUrl as string)}`, url: r.prodUrl as string }));
}

// — Exportaciones —

/** CSV de problemas: separador `;`, UTF-8 con BOM, celdas de texto con fórmulas neutralizadas. */
export async function issuesCsv(ctx: Ctx, auditId: string): Promise<{ filename: string; csv: string } | null> {
  const a = await getAudit(ctx, auditId);
  if (!a) return null;
  const groups = await listIssueGroups(ctx, auditId);
  const cell = (v: unknown) => {
    const s = String(v ?? "").replace(/[\r\n]+/g, " ");
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[";]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [["categoria", "severidad", "codigo", "problema", "url", "detalle", "como_corregirlo", "fingerprint"].join(";")];
  const fps = await getDb()
    .select({ id: schema.seoIssue.id, fp: schema.seoIssue.fingerprint })
    .from(schema.seoIssue)
    .where(and(eq(schema.seoIssue.workspaceId, ctx.workspaceId), eq(schema.seoIssue.auditId, auditId)));
  const fpOf = new Map(fps.map((r) => [r.id, r.fp]));
  for (const g of groups)
    for (const i of g.items)
      lines.push(
        [
          SEO_LABELS.category[g.category] ?? g.category,
          SEO_LABELS.severity[g.severity] ?? g.severity,
          g.code,
          g.def.title,
          i.url ?? "(todo el sitio)",
          detailText(i.details),
          g.def.fix,
          fpOf.get(i.id) ?? "",
        ]
          .map(cell)
          .join(";"),
      );
  const date = a.audit.createdAt.toISOString().slice(0, 10);
  return { filename: `seo-${a.host.replace(/[^a-z0-9.-]/gi, "_")}-${date}.csv`, csv: `﻿${lines.join("\r\n")}` };
}

/** Detalle legible de un problema (para CSV, PDF y UI). */
export function detailText(d: Record<string, unknown>): string {
  const parts: string[] = [];
  const v = (k: string) => d[k];
  if (v("status") !== undefined && v("status") !== null) parts.push(`HTTP ${v("status")}`);
  if (v("error")) parts.push(String(v("error")));
  if (v("title")) parts.push(`«${String(v("title")).slice(0, 80)}»`);
  if (v("length")) parts.push(`${v("length")} caracteres`);
  if (v("words") !== undefined) parts.push(`${v("words")} palabras`);
  if (v("count")) parts.push(`${v("count")} elementos`);
  if (v("ttfbMs")) parts.push(`TTFB ${v("ttfbMs")} ms`);
  if (v("sizeBytes")) parts.push(`${Math.round(Number(v("sizeBytes")) / 1024)} KB`);
  if (v("performance") !== undefined) parts.push(`Lighthouse ${v("performance")} (${v("strategy") === "desktop" ? "escritorio" : "celular"})`);
  if (v("lcpP75")) parts.push(`LCP p75 ${v("lcpP75")} ms`);
  if (v("inpP75")) parts.push(`INP p75 ${v("inpP75")} ms`);
  if (v("clsP75") !== undefined && v("clsP75") !== null) parts.push(`CLS p75 ${v("clsP75")}`);
  if (Array.isArray(v("missing"))) parts.push(`faltan ${(v("missing") as string[]).join(", ")}`);
  if (Array.isArray(v("codes"))) parts.push(`códigos: ${(v("codes") as string[]).join(", ")}`);
  if (v("canonical")) parts.push(`canonical → ${v("canonical")}`);
  if (v("to")) parts.push(`→ ${v("to")}`);
  if (v("final")) parts.push(`destino final ${v("final")}`);
  if (Array.isArray(v("hops"))) parts.push(`${(v("hops") as unknown[]).length} saltos`);
  if (Array.isArray(v("from")) && (v("from") as unknown[]).length) parts.push(`enlazada desde ${(v("from") as string[]).slice(0, 3).join(", ")}${(v("from") as unknown[]).length > 3 ? "…" : ""}`);
  if (Array.isArray(v("resources")) && (v("resources") as unknown[]).length) parts.push((v("resources") as string[]).slice(0, 2).join(", "));
  return parts.join(" · ");
}

/** Datos para el informe PDF (marca de la agencia desde la configuración del workspace). */
export async function reportData(ctx: Ctx & { workspace?: { settings: unknown } }, auditId: string) {
  const a = await getAudit(ctx, auditId);
  if (!a) return null;
  const [groups, perf, ws] = await Promise.all([
    listIssueGroups(ctx, auditId),
    getPerformance(ctx, auditId),
    getDb().select({ settings: schema.workspace.settings }).from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId)),
  ]);
  const comparable = await comparableAudits(ctx, auditId);
  const prev = comparable.find((c) => c.createdAt < a.audit.createdAt);
  const cmp = prev ? await compareAudits(ctx, auditId, prev.id) : null;
  return { ...a, groups, perf, brand: brandFromSettings(ws[0]?.settings as never), compare: cmp && !("error" in cmp) ? cmp : null };
}
