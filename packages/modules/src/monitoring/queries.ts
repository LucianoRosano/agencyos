import { assertCan, type Ctx, can } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";

export type HourBucket = { hour: string; total: number; fails: number; avgLatency: number | null };

/**
 * Entornos monitoreados con estado, uptime 24 h / 7 días, latencia y barras por hora (24 h).
 * Del acceso de WordPress solo se exponen usuario y estado: la Application Password nunca sale de la base.
 */
export async function listMonitoredEnvironments(ctx: Ctx, now = new Date()) {
  assertCan(ctx, "read", "project");
  const db = getDb();
  const envs = await db
    .select({
      env: schema.siteEnvironment,
      site: { id: schema.site.id, name: schema.site.name, monitorEnabled: schema.site.monitorEnabled, clientId: schema.site.clientId },
      clientName: schema.client.name,
      hostingName: schema.hosting.provider,
      wp: {
        id: schema.integration.id,
        config: schema.integration.config,
        status: schema.integration.status,
        lastOkAt: schema.integration.lastOkAt,
        lastError: schema.integration.lastError,
      },
    })
    .from(schema.siteEnvironment)
    .innerJoin(schema.site, and(eq(schema.site.id, schema.siteEnvironment.siteId), scoped(schema.site, ctx)))
    .leftJoin(schema.client, and(eq(schema.client.id, schema.site.clientId), eq(schema.client.workspaceId, schema.site.workspaceId)))
    .leftJoin(schema.hosting, and(eq(schema.hosting.id, schema.siteEnvironment.hostingId), eq(schema.hosting.workspaceId, schema.siteEnvironment.workspaceId)))
    .leftJoin(
      schema.integration,
      and(
        eq(schema.integration.id, schema.siteEnvironment.integrationId),
        eq(schema.integration.workspaceId, schema.siteEnvironment.workspaceId),
        sql`${schema.integration.deletedAt} is null`,
      ),
    )
    .where(scoped(schema.siteEnvironment, ctx))
    .orderBy(asc(schema.site.name), asc(schema.siteEnvironment.kind));
  if (!envs.length) return [];
  const ids = envs.map((e) => e.env.id);
  const since7 = new Date(now.getTime() - 7 * 86_400_000);
  const since24 = new Date(now.getTime() - 86_400_000);
  const [stats, hours] = await Promise.all([
    db
      .select({
        id: schema.uptimeCheck.siteEnvironmentId,
        n7: sql<number>`count(*)::int`,
        ok7: sql<number>`count(*) filter (where ${schema.uptimeCheck.ok})::int`,
        n24: sql<number>`count(*) filter (where ${schema.uptimeCheck.checkedAt} >= ${since24})::int`,
        ok24: sql<number>`count(*) filter (where ${schema.uptimeCheck.ok} and ${schema.uptimeCheck.checkedAt} >= ${since24})::int`,
        lat24: sql<
          number | null
        >`round(avg(${schema.uptimeCheck.latencyMs}) filter (where ${schema.uptimeCheck.ok} and ${schema.uptimeCheck.checkedAt} >= ${since24}))::int`,
      })
      .from(schema.uptimeCheck)
      .where(
        and(eq(schema.uptimeCheck.workspaceId, ctx.workspaceId), inArray(schema.uptimeCheck.siteEnvironmentId, ids), gte(schema.uptimeCheck.checkedAt, since7)),
      )
      .groupBy(schema.uptimeCheck.siteEnvironmentId),
    db
      .select({
        id: schema.uptimeCheck.siteEnvironmentId,
        hour: sql<string>`to_char(date_trunc('hour', ${schema.uptimeCheck.checkedAt} at time zone 'UTC'), 'YYYY-MM-DD"T"HH24')`,
        total: sql<number>`count(*)::int`,
        fails: sql<number>`count(*) filter (where not ${schema.uptimeCheck.ok})::int`,
        avgLatency: sql<number | null>`round(avg(${schema.uptimeCheck.latencyMs}) filter (where ${schema.uptimeCheck.ok}))::int`,
      })
      .from(schema.uptimeCheck)
      .where(
        and(
          eq(schema.uptimeCheck.workspaceId, ctx.workspaceId),
          inArray(schema.uptimeCheck.siteEnvironmentId, ids),
          gte(schema.uptimeCheck.checkedAt, since24),
        ),
      )
      .groupBy(schema.uptimeCheck.siteEnvironmentId, sql`2`),
  ]);
  const st = new Map(stats.map((s) => [s.id, s]));
  // 24 casilleros por hora (UTC), del más viejo al actual.
  const slots: string[] = [];
  for (let i = 23; i >= 0; i--) slots.push(new Date(now.getTime() - i * 3_600_000).toISOString().slice(0, 13));
  const showWp = can(ctx, "read", "settings");
  return envs.map(({ env, site, clientName, hostingName, wp }) => {
    const s = st.get(env.id);
    const mine = new Map(hours.filter((h) => h.id === env.id).map((h) => [h.hour, h]));
    const cfg = (wp?.config ?? {}) as { username?: string; plugins?: { name: string; version: string; status: string }[]; pluginsCheckedAt?: string };
    return {
      id: env.id,
      kind: env.kind,
      url: env.url,
      siteId: site.id,
      siteName: site.name,
      monitorEnabled: site.monitorEnabled,
      clientName,
      hostingId: env.hostingId,
      hostingName,
      lastStatus: env.lastStatus,
      lastCheckedAt: env.lastCheckedAt,
      lastSeenAt: env.lastSeenAt,
      sslExpiresOn: env.sslExpiresOn,
      sslIssuer: env.sslIssuer,
      wpVersion: env.wpVersion,
      phpVersion: env.phpVersion,
      uptime24: s?.n24 ? Math.round((s.ok24 / s.n24) * 1000) / 10 : null,
      uptime7: s?.n7 ? Math.round((s.ok7 / s.n7) * 1000) / 10 : null,
      latency24: s?.lat24 ?? null,
      hours: slots.map<HourBucket>((h) => {
        const b = mine.get(h);
        return { hour: h, total: b?.total ?? 0, fails: b?.fails ?? 0, avgLatency: b?.avgLatency ?? null };
      }),
      wordpress:
        showWp && wp?.id
          ? {
              username: cfg.username ?? null,
              status: wp.status,
              lastOkAt: wp.lastOkAt,
              lastError: wp.lastError,
              plugins: cfg.plugins ?? [],
              pluginsCheckedAt: cfg.pluginsCheckedAt ?? null,
            }
          : null,
    };
  });
}
export type MonitoredEnvironment = Awaited<ReturnType<typeof listMonitoredEnvironments>>[number];

/** Entornos caídos (2 fallos seguidos) de sitios con monitoreo activo: van a "Ponerse al día" de Hoy. */
export async function downEnvironments(ctx: Ctx) {
  if (!can(ctx, "read", "project")) return [];
  return getDb()
    .select({ id: schema.siteEnvironment.id, url: schema.siteEnvironment.url, lastSeenAt: schema.siteEnvironment.lastSeenAt, siteName: schema.site.name })
    .from(schema.siteEnvironment)
    .innerJoin(schema.site, and(eq(schema.site.id, schema.siteEnvironment.siteId), scoped(schema.site, ctx), eq(schema.site.monitorEnabled, true)))
    .where(and(scoped(schema.siteEnvironment, ctx), eq(schema.siteEnvironment.lastStatus, "down")));
}

/** Sitios existentes para asociar un entorno nuevo, y hostings cargados. */
export async function monitoringFormOptions(ctx: Ctx) {
  const db = getDb();
  const [sites, hostings] = await Promise.all([
    db.select({ id: schema.site.id, name: schema.site.name }).from(schema.site).where(scoped(schema.site, ctx)).orderBy(asc(schema.site.name)),
    db
      .select({ id: schema.hosting.id, provider: schema.hosting.provider, plan: schema.hosting.plan })
      .from(schema.hosting)
      .where(scoped(schema.hosting, ctx))
      .orderBy(asc(schema.hosting.provider)),
  ]);
  return {
    sites: sites.map((s) => ({ value: s.id, label: s.name })),
    hostings: hostings.map((h) => ({ value: h.id, label: h.plan ? `${h.provider} · ${h.plan}` : h.provider })),
  };
}
