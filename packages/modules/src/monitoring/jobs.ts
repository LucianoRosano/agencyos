import { addDays, diffDays, formatDate, systemCtx, todayAR } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { type DbOrTx, schema } from "@agencyos/db";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { assetDueDates, assetKindLabel } from "../assets/queries";
import { decryptSecret } from "../shared/crypto";
import { getDb } from "../shared/db";
import { type SafeResponse, safeFetch } from "../shared/safe-fetch";

/**
 * Trabajos del worker de Monitoreo (registrados en apps/worker/src/registry.ts):
 * - runUptimeChecks: cada 5 min, HTTP a los entornos de sitios con monitoreo activo.
 * - runDailyMonitoring: SSL (TLS), vencimiento de dominio por RDAP, WordPress/PHP por REST y avisos de vencimientos.
 * - purgeUptimeChecks: borra chequeos de más de 90 días.
 * Todos los pedidos HTTP pasan por `safeFetch` (anti-SSRF). En tests se inyecta un `fetcher` falso.
 */
export type Fetcher = (url: string, opts?: Parameters<typeof safeFetch>[1]) => Promise<SafeResponse>;

const TIMEOUT = 15_000;
const UA = "AGENCYOS-Monitor/1.0 (+https://agencyos)";

export type ProbeResult = { ok: boolean; statusCode: number | null; latencyMs: number | null; error: string | null; res?: SafeResponse };

/** HEAD con fallback a GET (hay servidores que no aceptan HEAD). OK = 2xx/3xx. */
export async function probe(url: string, fetcher: Fetcher = safeFetch): Promise<ProbeResult> {
  let headErr: string | null = null;
  try {
    const r = await fetcher(url, { method: "HEAD", timeoutMs: TIMEOUT, userAgent: UA, maxBytes: 64 * 1024 });
    if (r.status >= 200 && r.status < 400) return { ok: true, statusCode: r.status, latencyMs: r.ttfbMs, error: null, res: r };
    headErr = `HTTP ${r.status}`;
  } catch (e) {
    headErr = errorText(e);
  }
  try {
    const r = await fetcher(url, { method: "GET", timeoutMs: TIMEOUT, userAgent: UA, maxBytes: 256 * 1024 });
    const ok = r.status >= 200 && r.status < 400;
    return { ok, statusCode: r.status, latencyMs: r.ttfbMs, error: ok ? null : `HTTP ${r.status}`, res: r };
  } catch (e) {
    return { ok: false, statusCode: null, latencyMs: null, error: errorText(e) || headErr };
  }
}

function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code === "ENOTFOUND" || /ENOTFOUND/.test(m)) return "El dominio no resuelve";
  if (code === "ECONNREFUSED") return "Conexión rechazada";
  if (code === "ECONNRESET") return "Conexión cortada";
  if (/CERT|certificate/i.test(code + m)) return "Certificado TLS inválido";
  return m.slice(0, 200) || "Error de red";
}

/** Notifica a dueños y administradores, con deduplicación. Devuelve cuántas se crearon. */
async function notifyOwners(
  t: DbOrTx,
  workspaceId: string,
  n: { type: string; title: string; entityType: string; entityId: string; dedupeKey: string },
): Promise<number> {
  const owners = await t
    .select({ userId: schema.membership.userId })
    .from(schema.membership)
    .where(and(eq(schema.membership.workspaceId, workspaceId), inArray(schema.membership.role, ["owner", "admin"])));
  let created = 0;
  for (const o of owners) {
    const r = await t
      .insert(schema.notification)
      .values({
        workspaceId,
        userId: o.userId,
        type: n.type,
        title: n.title.slice(0, 200),
        entityType: n.entityType,
        entityId: n.entityId,
        dedupeKey: n.dedupeKey,
      })
      .onConflictDoNothing()
      .returning({ id: schema.notification.id });
    created += r.length;
  }
  return created;
}

type EnvRow = typeof schema.siteEnvironment.$inferSelect & { siteName: string };

/**
 * Guarda un chequeo y resuelve la transición de estado. Caída = 2 fallos seguidos (evita falsos positivos);
 * recuperación = primer chequeo OK después de una caída.
 */
export async function recordCheck(env: EnvRow, r: ProbeResult, now = new Date()) {
  const db = getDb();
  return db.transaction(async (t) => {
    const [prev] = await t
      .select({ ok: schema.uptimeCheck.ok })
      .from(schema.uptimeCheck)
      .where(eq(schema.uptimeCheck.siteEnvironmentId, env.id))
      .orderBy(desc(schema.uptimeCheck.checkedAt))
      .limit(1);
    const [check] = await t
      .insert(schema.uptimeCheck)
      .values({
        workspaceId: env.workspaceId,
        siteEnvironmentId: env.id,
        checkedAt: now,
        statusCode: r.statusCode,
        ok: r.ok,
        latencyMs: r.latencyMs,
        error: r.error,
      })
      .returning();
    let status = env.lastStatus;
    let transition: "down" | "up" | null = null;
    if (r.ok) {
      if (env.lastStatus === "down") transition = "up";
      status = "up";
    } else if (prev && !prev.ok && env.lastStatus !== "down") {
      status = "down";
      transition = "down";
    }
    await t
      .update(schema.siteEnvironment)
      .set({ lastStatus: status, lastCheckedAt: now, ...(r.ok ? { lastSeenAt: now } : {}) })
      .where(eq(schema.siteEnvironment.id, env.id));
    if (transition && check) {
      const ctx = systemCtx(env.workspaceId);
      const type = transition === "down" ? "sitio.caido" : "sitio.recuperado";
      const title =
        transition === "down" ? `${env.siteName} está caído (${env.url}): ${r.error ?? "sin respuesta"}` : `${env.siteName} volvió a responder (${env.url})`;
      await recordEvent(t, ctx, {
        type,
        entityType: "site",
        entityId: env.siteId,
        summary: title,
        payload: { environmentId: env.id, url: env.url, statusCode: r.statusCode, error: r.error },
      });
      await notifyOwners(t, env.workspaceId, { type, title, entityType: "site", entityId: env.siteId, dedupeKey: `${type}:${env.id}:${check.id}` });
    }
    return { check, status, transition };
  });
}

async function monitoredEnvironments(where?: ReturnType<typeof eq>) {
  return getDb()
    .select({ env: schema.siteEnvironment, siteName: schema.site.name, clientId: schema.site.clientId })
    .from(schema.siteEnvironment)
    .innerJoin(schema.site, and(eq(schema.site.id, schema.siteEnvironment.siteId), eq(schema.site.workspaceId, schema.siteEnvironment.workspaceId)))
    .where(and(isNull(schema.siteEnvironment.deletedAt), isNull(schema.site.deletedAt), eq(schema.site.monitorEnabled, true), where))
    .orderBy(asc(schema.siteEnvironment.lastCheckedAt));
}

/** Ejecuta en paralelo con un límite. */
async function pool<T>(items: T[], limit: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const x = items[i++] as T;
        await fn(x);
      }
    }),
  );
}

/** Job cada 5 min. */
export async function runUptimeChecks(opts: { fetcher?: Fetcher; now?: Date; workspaceId?: string } = {}) {
  const rows = await monitoredEnvironments(opts.workspaceId ? eq(schema.siteEnvironment.workspaceId, opts.workspaceId) : undefined);
  const out = { checked: 0, down: 0, recovered: 0 };
  await pool(rows, 8, async ({ env, siteName }) => {
    const r = await probe(env.url, opts.fetcher);
    const res = await recordCheck({ ...env, siteName }, r, opts.now);
    out.checked++;
    if (res.transition === "down") out.down++;
    if (res.transition === "up") out.recovered++;
  });
  return out;
}

/** Chequeo inmediato de un entorno (botón "Chequear ahora"); respeta el workspace del contexto. */
export async function checkEnvironmentNow(workspaceId: string, envId: string, fetcher?: Fetcher) {
  const [row] = await monitoredEnvironmentsAll(workspaceId, envId);
  if (!row) return null;
  const r = await probe(row.env.url, fetcher);
  const res = await recordCheck({ ...row.env, siteName: row.siteName }, r);
  if (r.res?.tls) await applyTls(row, r.res.tls);
  return { ...res, ok: r.ok, latencyMs: r.latencyMs, error: r.error };
}

async function monitoredEnvironmentsAll(workspaceId: string, envId: string) {
  return getDb()
    .select({ env: schema.siteEnvironment, siteName: schema.site.name, clientId: schema.site.clientId })
    .from(schema.siteEnvironment)
    .innerJoin(schema.site, and(eq(schema.site.id, schema.siteEnvironment.siteId), eq(schema.site.workspaceId, schema.siteEnvironment.workspaceId)))
    .where(
      and(
        eq(schema.siteEnvironment.id, envId),
        eq(schema.siteEnvironment.workspaceId, workspaceId),
        isNull(schema.siteEnvironment.deletedAt),
        isNull(schema.site.deletedAt),
      ),
    )
    .limit(1);
}

// --- SSL ---
function tlsDate(validTo: string): string | null {
  const d = new Date(validTo);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Actualiza el entorno y el certificado SSL (crea o actualiza `certificate` kind=ssl con subject = host). */
async function applyTls(
  row: { env: typeof schema.siteEnvironment.$inferSelect; siteName: string; clientId: string | null },
  tls: { validTo?: string; issuer?: string },
) {
  const expires = tls.validTo ? tlsDate(tls.validTo) : null;
  if (!expires) return false;
  const host = new URL(row.env.url).hostname;
  const ws = row.env.workspaceId;
  const ctx = systemCtx(ws);
  const notes = `Emisor: ${tls.issuer ?? "desconocido"} · leído del certificado TLS el ${formatDate(todayAR())}`;
  await getDb().transaction(async (t) => {
    await t
      .update(schema.siteEnvironment)
      .set({ sslExpiresOn: expires, sslIssuer: tls.issuer ?? null })
      .where(eq(schema.siteEnvironment.id, row.env.id));
    const [cert] = await t
      .select()
      .from(schema.certificate)
      .where(
        and(
          eq(schema.certificate.workspaceId, ws),
          isNull(schema.certificate.deletedAt),
          eq(schema.certificate.kind, "ssl"),
          eq(schema.certificate.subject, host),
        ),
      )
      .limit(1);
    if (cert) {
      if (cert.expiresOn === expires) {
        await t.update(schema.certificate).set({ notes }).where(eq(schema.certificate.id, cert.id));
        return;
      }
      await t
        .update(schema.certificate)
        .set({ expiresOn: expires, notes, siteId: cert.siteId ?? row.env.siteId })
        .where(eq(schema.certificate.id, cert.id));
      await recordEvent(t, ctx, {
        type: "certificado.ssl_leido",
        entityType: "certificate",
        entityId: cert.id,
        summary: `El SSL de ${host} vence el ${formatDate(expires)} (${tls.issuer ?? "emisor desconocido"})`,
        payload: { source: "tls", expiresOn: expires, issuer: tls.issuer ?? null },
      });
    } else {
      const [c] = await t
        .insert(schema.certificate)
        .values({
          workspaceId: ws,
          kind: "ssl",
          subject: host,
          expiresOn: expires,
          siteId: row.env.siteId,
          clientId: row.clientId,
          notes,
          notifyDaysBefore: 14,
        })
        .returning();
      if (c)
        await recordEvent(t, ctx, {
          type: "certificado.ssl_leido",
          entityType: "certificate",
          entityId: c.id,
          summary: `Registró el SSL de ${host}: vence el ${formatDate(expires)}`,
          payload: { source: "tls", expiresOn: expires, issuer: tls.issuer ?? null },
        });
    }
  });
  return true;
}

export async function refreshSsl(opts: { fetcher?: Fetcher; workspaceId?: string } = {}) {
  const fetcher = opts.fetcher ?? safeFetch;
  const rows = (await monitoredEnvironments(opts.workspaceId ? eq(schema.siteEnvironment.workspaceId, opts.workspaceId) : undefined)).filter((r) =>
    r.env.url.startsWith("https://"),
  );
  let updated = 0;
  await pool(rows, 4, async (row) => {
    try {
      const r = await fetcher(row.env.url, { method: "HEAD", timeoutMs: TIMEOUT, userAgent: UA, maxBytes: 16 * 1024, maxRedirects: 0 });
      if (r.tls && (await applyTls(row, r.tls))) updated++;
    } catch {
      // un sitio caído no tiene TLS que leer: lo reporta el chequeo de uptime
    }
  });
  return updated;
}

// --- Dominio por RDAP ---
type Rdap = {
  events?: { eventAction?: string; eventDate?: string }[];
  entities?: { roles?: string[]; vcardArray?: [string, [string, unknown, string, unknown][]] }[];
};

export function parseRdap(json: Rdap): { expiresOn: string | null; registrar: string | null } {
  const ev = json.events?.find((e) => e.eventAction === "expiration");
  const d = ev?.eventDate ? new Date(ev.eventDate) : null;
  const expiresOn = d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
  const reg = json.entities?.find((e) => e.roles?.includes("registrar"));
  const fn = reg?.vcardArray?.[1]?.find((x) => x[0] === "fn");
  return { expiresOn, registrar: typeof fn?.[3] === "string" ? (fn[3] as string).slice(0, 120) : null };
}

/** Completa el vencimiento de los dominios que no lo tienen cargado, consultando RDAP público (rdap.org). */
export async function refreshDomainsFromRdap(opts: { fetcher?: Fetcher; workspaceId?: string; limit?: number } = {}) {
  const fetcher = opts.fetcher ?? safeFetch;
  const rows = await getDb()
    .select()
    .from(schema.domain)
    .where(
      and(isNull(schema.domain.deletedAt), isNull(schema.domain.expiresOn), opts.workspaceId ? eq(schema.domain.workspaceId, opts.workspaceId) : undefined),
    )
    .limit(opts.limit ?? 50);
  let updated = 0;
  for (const d of rows) {
    const url = `https://rdap.org/domain/${encodeURIComponent(d.name)}`;
    try {
      const r = await fetcher(url, { method: "GET", timeoutMs: TIMEOUT, userAgent: UA, maxBytes: 512 * 1024, headers: { accept: "application/rdap+json" } });
      if (r.status !== 200) continue;
      const parsed = parseRdap(JSON.parse(r.body.toString("utf8")) as Rdap);
      if (!parsed.expiresOn) continue;
      const source = r.redirects.at(-1) ?? url;
      await getDb().transaction(async (t) => {
        await t
          .update(schema.domain)
          .set({ expiresOn: parsed.expiresOn, registrar: d.registrar ?? parsed.registrar })
          .where(and(eq(schema.domain.id, d.id), isNull(schema.domain.expiresOn)));
        await recordEvent(t, systemCtx(d.workspaceId), {
          type: "dominio.vencimiento_rdap",
          entityType: "domain",
          entityId: d.id,
          summary: `Vencimiento de ${d.name} leído por RDAP: ${formatDate(parsed.expiresOn)}`,
          payload: { source: "rdap", url: source, expiresOn: parsed.expiresOn },
        });
      });
      updated++;
    } catch {
      // RDAP no disponible para ese TLD o sin red: se reintenta mañana
    }
  }
  return updated;
}

// --- WordPress / PHP vía REST ---
const join = (base: string, path: string) => new URL(path, base.endsWith("/") ? base : `${base}/`).toString();

export async function refreshWordpress(opts: { fetcher?: Fetcher; workspaceId?: string } = {}) {
  const fetcher = opts.fetcher ?? safeFetch;
  const db = getDb();
  const rows = await db
    .select({ env: schema.siteEnvironment, integ: schema.integration })
    .from(schema.siteEnvironment)
    .innerJoin(
      schema.integration,
      and(eq(schema.integration.id, schema.siteEnvironment.integrationId), eq(schema.integration.workspaceId, schema.siteEnvironment.workspaceId)),
    )
    .innerJoin(schema.site, and(eq(schema.site.id, schema.siteEnvironment.siteId), eq(schema.site.workspaceId, schema.siteEnvironment.workspaceId)))
    .where(
      and(
        isNull(schema.siteEnvironment.deletedAt),
        isNull(schema.site.deletedAt),
        eq(schema.site.monitorEnabled, true),
        isNull(schema.integration.deletedAt),
        eq(schema.integration.provider, "wordpress"),
        isNotNull(schema.integration.secretEnc),
        opts.workspaceId ? eq(schema.siteEnvironment.workspaceId, opts.workspaceId) : undefined,
      ),
    );
  let updated = 0;
  for (const { env, integ } of rows) {
    const cfg = integ.config as { username?: string };
    try {
      const pass = decryptSecret(integ.secretEnc as Buffer);
      const auth = `Basic ${Buffer.from(`${cfg.username ?? ""}:${pass}`).toString("base64")}`;
      const get = (u: string, headers: Record<string, string> = {}) =>
        fetcher(u, { method: "GET", timeoutMs: TIMEOUT, userAgent: UA, maxBytes: 1024 * 1024, headers });
      const home = await get(env.url);
      const php = (home.headers["x-powered-by"] ?? "").match(/PHP\/([\d.]+)/i)?.[1] ?? null;
      let wp = home.body.toString("utf8").match(/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress ([\d.]+)/i)?.[1] ?? null;
      if (!wp) {
        const feed = await get(join(env.url, "feed/")).catch(() => null);
        wp = feed?.body.toString("utf8").match(/<generator>https?:\/\/wordpress\.org\/\?v=([\d.]+)<\/generator>/i)?.[1] ?? null;
      }
      const plugins = await get(join(env.url, "wp-json/wp/v2/plugins?context=edit"), { authorization: auth, accept: "application/json" });
      if (plugins.status === 401 || plugins.status === 403) {
        await db
          .update(schema.integration)
          .set({ status: "error", lastError: "WordPress rechazó el usuario o la Application Password" })
          .where(eq(schema.integration.id, integ.id));
        continue;
      }
      let list: { name: string; version: string; status: string }[] = [];
      if (plugins.status === 200) {
        const parsed = JSON.parse(plugins.body.toString("utf8")) as { name?: string; version?: string; status?: string }[];
        if (Array.isArray(parsed))
          list = parsed
            .slice(0, 200)
            .map((p) => ({ name: String(p.name ?? "").slice(0, 120), version: String(p.version ?? "").slice(0, 40), status: String(p.status ?? "") }));
      }
      await db.transaction(async (t) => {
        await t
          .update(schema.siteEnvironment)
          .set({ ...(wp ? { wpVersion: wp } : {}), ...(php ? { phpVersion: php } : {}) })
          .where(eq(schema.siteEnvironment.id, env.id));
        await t
          .update(schema.integration)
          .set({
            config: { ...(integ.config as Record<string, unknown>), plugins: list, pluginsCheckedAt: new Date().toISOString() },
            status: "active",
            lastOkAt: new Date(),
            lastError: plugins.status === 200 ? null : `La REST API respondió HTTP ${plugins.status}`,
          })
          .where(eq(schema.integration.id, integ.id));
      });
      updated++;
    } catch (e) {
      await db
        .update(schema.integration)
        .set({ status: "error", lastError: errorText(e) })
        .where(eq(schema.integration.id, integ.id));
    }
  }
  return updated;
}

// --- Avisos de vencimientos (dominio.por_vencer, ssl.por_vencer, …) ---
function dueEventType(kind: "domain" | "hosting" | "certificate", certKind?: string) {
  if (kind === "domain") return "dominio.por_vencer";
  if (kind === "hosting") return "hosting.por_vencer";
  return certKind === "ssl" ? "ssl.por_vencer" : "certificado.por_vencer";
}

/** Una notificación + evento por activo y fecha de vencimiento (deduplicado por dedupeKey). */
export async function dueDateAlerts(today = todayAR()) {
  const workspaces = await getDb().select({ id: schema.workspace.id }).from(schema.workspace);
  let sent = 0;
  for (const w of workspaces) {
    const ctx = systemCtx(w.id);
    const due = await assetDueDates(ctx, { to: addDays(today, 365), from: addDays(today, -30) });
    for (const a of due) {
      const d = diffDays(a.expiresOn, today);
      if (d > a.notifyDaysBefore) continue;
      const type = dueEventType(a.kind, a.certKind);
      const what = `${assetKindLabel(a)} ${a.title}`;
      const title = d < 0 ? `${what} venció hace ${-d} d` : d === 0 ? `${what} vence hoy` : `${what} vence en ${d} d (${formatDate(a.expiresOn)})`;
      await getDb().transaction(async (t) => {
        const n = await notifyOwners(t, w.id, { type, title, entityType: a.kind, entityId: a.id, dedupeKey: `${type}:${a.id}:${a.expiresOn}` });
        if (n > 0) {
          await recordEvent(t, ctx, { type, entityType: a.kind, entityId: a.id, summary: title, payload: { expiresOn: a.expiresOn, daysLeft: d } });
          sent++;
        }
      });
    }
  }
  return sent;
}

/** Job diario. Cada parte falla por separado. */
export async function runDailyMonitoring(opts: { fetcher?: Fetcher; today?: string } = {}) {
  const safe = async <T>(fn: () => Promise<T>) => fn().catch((e) => `error: ${errorText(e)}`);
  const ssl = await safe(() => refreshSsl(opts));
  const rdap = await safe(() => refreshDomainsFromRdap(opts));
  const wordpress = await safe(() => refreshWordpress(opts));
  const alerts = await safe(() => dueDateAlerts(opts.today));
  return { ssl, rdap, wordpress, alerts };
}

/** Purga de chequeos viejos (> 90 días). */
export async function purgeUptimeChecks(days = 90, now = new Date()) {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const r = await getDb().delete(schema.uptimeCheck).where(lt(schema.uptimeCheck.checkedAt, cutoff)).returning({ id: schema.uptimeCheck.id });
  return r.length;
}
