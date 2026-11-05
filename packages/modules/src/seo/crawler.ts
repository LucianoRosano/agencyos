import { type Ctx, systemCtx } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { type DbOrTx, getDb, schema } from "@agencyos/db";
import { and, desc, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import { assertPublicUrl, SsrfError } from "../shared/safe-fetch";
import { allowLocalForTests, type Fetcher, isLocalHost, SEO_USER_AGENT, seoFetch } from "./fetcher";
import { CRUX_DAILY_QUOTA, PSI_DAILY_QUOTA, runCrux, runPsi } from "./google";
import { parseHtml } from "./html";
import { blocksEverything, groupFor, isAllowed, parseRobots, type RobotsGroup } from "./robots";
import { computeIndexable, type CrawledLink, type CrawledPage, detectIssues, type FieldResult, type LabResult, type LinkCheck, type SiteFacts } from "./rules";
import { classify, computeScore, fingerprint, normalizeUrl, SCORE_FORMULA_TEXT, SCORE_FORMULA_VERSION, SEVERITY_WEIGHTS } from "./score";
import { parseSitemap, sitemapText } from "./sitemap";
import { type AuditSummary, configFrom, sameOrigin } from "./config";

export { type AuditConfig, type AuditSummary, configFrom, DEFAULT_CONFIG, sameOrigin } from "./config";
import { getGoogleKeyForWorker, recordGoogleUsage } from "./google-key";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_LINKS_PER_PAGE = 300;
const STALE_MS = 20 * 60_000;

/** Toma la auditoría en cola más vieja (de forma atómica) y la ejecuta. Devuelve su id o null si no había. */
export async function runNextQueuedAudit(fetcher: Fetcher = seoFetch): Promise<string | null> {
  const db = getDb();
  const [next] = await db
    .select({ id: schema.seoAudit.id })
    .from(schema.seoAudit)
    .where(and(eq(schema.seoAudit.status, "queued"), isNull(schema.seoAudit.deletedAt)))
    .orderBy(schema.seoAudit.createdAt)
    .limit(1);
  if (!next) return null;
  await runAudit(next.id, fetcher);
  return next.id;
}

/** Auditorías "running" sin progreso hace más de 20 min: el worker se cortó. Se marcan como fallidas. */
export async function failStaleAudits(now = new Date()) {
  const db = getDb();
  const stale = await db
    .update(schema.seoAudit)
    .set({ status: "failed", finishedAt: now, error: "El rastreo se interrumpió (el worker se reinició o se cortó). Volvé a auditar." })
    .where(and(eq(schema.seoAudit.status, "running"), lt(schema.seoAudit.updatedAt, new Date(now.getTime() - STALE_MS))))
    .returning();
  for (const a of stale)
    await recordEvent(db, systemCtx(a.workspaceId), {
      type: "auditoria.fallida",
      entityType: "seo_audit",
      entityId: a.id,
      summary: `La auditoría SEO de ${hostOf(a.rootUrl)} se interrumpió`,
    });
  return stale.length;
}

const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};

/**
 * Ejecuta una auditoría: queued → running → completed | failed | cancelled.
 * Respeta robots.txt siempre, concurrencia ≤ 4 con retardo, todo pedido pasa por el fetch anti-SSRF.
 */
export async function runAudit(auditId: string, fetcher: Fetcher = seoFetch): Promise<{ status: string } | null> {
  const db = getDb();
  const [a] = await db
    .update(schema.seoAudit)
    .set({ status: "running", startedAt: new Date(), error: null })
    .where(and(eq(schema.seoAudit.id, auditId), eq(schema.seoAudit.status, "queued")))
    .returning();
  if (!a) return null;
  const ctx = systemCtx(a.workspaceId);
  await recordEvent(db, ctx, { type: "auditoria.iniciada", entityType: "seo_audit", entityId: a.id, summary: `Empezó la auditoría SEO de ${hostOf(a.rootUrl)}` });
  try {
    const status = await crawlAndStore(a, ctx, fetcher);
    return { status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(schema.seoAudit)
      .set({ status: "failed", finishedAt: new Date(), error: msg.slice(0, 500) })
      .where(and(eq(schema.seoAudit.id, a.id), ne(schema.seoAudit.status, "cancelled")));
    await recordEvent(db, ctx, {
      type: "auditoria.fallida",
      entityType: "seo_audit",
      entityId: a.id,
      summary: `Falló la auditoría SEO de ${hostOf(a.rootUrl)}: ${msg.slice(0, 120)}`,
    });
    await notifyOwners(db, a.workspaceId, {
      type: "auditoria.fallida",
      title: `Falló la auditoría SEO de ${hostOf(a.rootUrl)}`,
      body: msg.slice(0, 300),
      entityId: a.id,
      dedupeKey: `seo:failed:${a.id}`,
    });
    return { status: "failed" };
  }
}

type Audit = typeof schema.seoAudit.$inferSelect;

async function crawlAndStore(a: Audit, ctx: Ctx, fetcher: Fetcher): Promise<string> {
  const db = getDb();
  const started = Date.now();
  const cfg = configFrom(a.config);
  const root = normalizeUrl(a.rootUrl);
  if (!root) throw new Error("La URL raíz no es válida");
  const rootU = new URL(root);
  const origin = rootU.origin;
  // Chequeo anti-SSRF temprano para fallar con un mensaje claro (cada pedido lo vuelve a validar).
  if (!(allowLocalForTests() && isLocalHost(rootU.hostname))) {
    try {
      await assertPublicUrl(root);
    } catch (e) {
      throw new Error(`Destino no permitido: ${e instanceof Error ? e.message : "URL inválida"}. Solo se auditan sitios públicos por http/https en los puertos 80 y 443.`);
    }
  }
  const hostKey = (h: string) => h.toLowerCase().replace(/^www\./, "");
  const isInternal = (u: string) => {
    try {
      return hostKey(new URL(u).hostname) === hostKey(rootU.hostname);
    } catch {
      return false;
    }
  };
  const summary: AuditSummary = {
    formula: { version: SCORE_FORMULA_VERSION, text: SCORE_FORMULA_TEXT, weights: SEVERITY_WEIGHTS },
    progress: { crawled: 0, queued: 0, blocked: 0, phase: "robots" },
  };
  let cancelled = false;
  let lastProgress = 0;
  const progress = async (force = false) => {
    if (!force && Date.now() - lastProgress < 1500) return;
    lastProgress = Date.now();
    const [row] = await db
      .update(schema.seoAudit)
      .set({ pagesCrawled: summary.progress.crawled, summary: summary as unknown as Record<string, unknown> })
      .where(eq(schema.seoAudit.id, a.id))
      .returning({ status: schema.seoAudit.status });
    if (!row || row.status === "cancelled") cancelled = true;
  };
  const timeUp = () => Date.now() - started > cfg.maxDurationMs;

  // 1) robots.txt (RFC 9309: 4xx = sin restricciones; 5xx o sin respuesta = no se rastrea)
  let group: RobotsGroup | null = null;
  const robotsFacts: SiteFacts["robots"] = { found: false, status: null, invalidLines: 0, blocksAll: false };
  let robotsSitemaps: string[] = [];
  try {
    const r = await fetchFollow(fetcher, `${origin}/robots.txt`);
    robotsFacts.status = r.status;
    if (r.status >= 500) throw new Error(`robots.txt respondió ${r.status}: por el estándar (RFC 9309) no se rastrea el sitio hasta que responda bien`);
    if (r.status === 200) {
      const parsed = parseRobots(r.body.toString("utf8"));
      robotsFacts.found = true;
      robotsFacts.invalidLines = parsed.invalidLines;
      group = groupFor(parsed, SEO_USER_AGENT);
      robotsFacts.blocksAll = blocksEverything(group);
      robotsSitemaps = parsed.sitemaps;
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("robots.txt respondió")) throw e;
    throw new Error(`No se pudo leer robots.txt (${e instanceof Error ? e.message : "error de red"}); sin robots.txt confirmado no se rastrea.`);
  }
  const delayMs = Math.min(10_000, Math.max(cfg.delayMs, (group?.crawlDelay ?? 0) * 1000));
  summary.robots = {
    found: robotsFacts.found,
    status: robotsFacts.status,
    sitemaps: robotsSitemaps,
    blocksAll: robotsFacts.blocksAll,
    rules: group?.rules.length ?? 0,
    crawlDelay: group?.crawlDelay ?? null,
  };
  const allowed = (u: string) => {
    const x = new URL(u);
    return isAllowed(group, `${x.pathname}${x.search}`);
  };

  // 2) sitemap.xml (declarados en robots o /sitemap.xml), con índices de un nivel
  summary.progress.phase = "sitemap";
  const sitemapUrls = new Set<string>();
  const smFiles: string[] = [];
  let smError: string | null = null;
  let smFound = false;
  const pending = (robotsSitemaps.length ? robotsSitemaps : [`${origin}/sitemap.xml`]).slice(0, 10);
  const seenSm = new Set<string>();
  while (pending.length && smFiles.length < 20) {
    const sm = pending.shift() as string;
    if (seenSm.has(sm)) continue;
    seenSm.add(sm);
    try {
      const r = await fetchFollow(fetcher, sm, { maxBytes: 50 * 1024 * 1024, timeoutMs: 30_000 });
      if (r.status !== 200) {
        if (robotsSitemaps.length) smError = `${sm} respondió ${r.status}`;
        continue;
      }
      smFound = true;
      smFiles.push(sm);
      const parsed = parseSitemap(sitemapText(r.body));
      if (parsed.kind === "invalid") {
        smError = `${sm}: ${parsed.error}`;
        continue;
      }
      if (parsed.kind === "index") pending.push(...parsed.locs.slice(0, 20));
      else
        for (const loc of parsed.locs) {
          const n = normalizeUrl(loc);
          if (n && sitemapUrls.size < 10_000) sitemapUrls.add(n);
        }
    } catch (e) {
      if (robotsSitemaps.length) smError = `${sm}: ${e instanceof Error ? e.message : "error"}`;
    }
  }
  if (robotsSitemaps.length && !smFound) smFound = smError !== null;

  // 3) HTTPS: ¿la versión http redirige a https?
  let httpRedirectsToHttps: boolean | null = null;
  if (rootU.protocol === "https:") {
    try {
      const r = await fetcher(`http://${rootU.host}${rootU.pathname}`, { method: "GET", maxBytes: 64 * 1024 });
      httpRedirectsToHttps = r.status >= 300 && r.status < 400 && /^https:/i.test(new URL(r.headers.location ?? "", root).protocol);
    } catch {
      httpRedirectsToHttps = null;
    }
  }

  // 4) Rastreo BFS
  summary.progress.phase = "crawl";
  const pages = new Map<string, CrawledPage>();
  const links: CrawledLink[] = [];
  const blocked = new Map<string, string[]>();
  const seen = new Set<string>();
  const queue: { url: string; depth: number; expand: boolean }[] = [];
  const enqueue = (url: string, depth: number, expand: boolean, from: string | null) => {
    if (seen.has(url)) return;
    if (!allowed(url)) {
      const b = blocked.get(url) ?? [];
      if (from && b.length < 20 && !b.includes(from)) b.push(from);
      blocked.set(url, b);
      summary.progress.blocked = blocked.size;
      return;
    }
    if (seen.size >= cfg.maxPages) return;
    seen.add(url);
    queue.push({ url, depth, expand });
  };
  enqueue(root, 0, true, null);
  let rootHeaders: Record<string, string> = {};
  let inFlight = 0;

  const crawlOne = async (item: { url: string; depth: number; expand: boolean }) => {
    const page: CrawledPage = {
      url: item.url,
      depth: item.depth,
      status: null,
      redirectTo: null,
      error: null,
      headers: {},
      sizeBytes: 0,
      ttfbMs: null,
      isHtml: false,
      parsed: null,
      canonical: null,
      indexable: false,
    };
    try {
      const r = await fetcher(item.url, { method: "GET", headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" } });
      page.status = r.status;
      page.headers = pickHeaders(r.headers);
      page.sizeBytes = r.body.length;
      page.ttfbMs = r.ttfbMs;
      if (item.url === root) rootHeaders = r.headers;
      if (r.status >= 300 && r.status < 400 && r.headers.location) {
        const to = normalizeUrl(r.headers.location, item.url);
        page.redirectTo = to;
        if (to && isInternal(to)) enqueue(to, item.depth, item.expand, item.url);
      }
      const ct = (r.headers["content-type"] ?? "").toLowerCase();
      page.isHtml = ct.includes("text/html") || ct.includes("application/xhtml");
      if (r.status === 200 && page.isHtml) {
        const html = r.body.toString("utf8");
        const parsed = parseHtml(html);
        page.parsed = parsed;
        const base = parsed.baseHref ? (normalizeUrl(parsed.baseHref, item.url) ?? item.url) : item.url;
        page.canonical = parsed.canonical ? normalizeUrl(parsed.canonical, base) : null;
        let n = 0;
        const seenHere = new Set<string>();
        for (const l of parsed.links) {
          if (/^(mailto|tel|javascript|data|sms|whatsapp):/i.test(l.href) || l.href.startsWith("#")) continue;
          const to = normalizeUrl(l.href, base);
          if (!to || seenHere.has(to)) continue;
          seenHere.add(to);
          if (n++ >= MAX_LINKS_PER_PAGE) break;
          const internal = isInternal(to);
          links.push({ from: item.url, to, internal, nofollow: l.nofollow, anchor: l.text.slice(0, 200) });
          if (internal && item.expand && item.depth + 1 <= cfg.maxDepth) enqueue(to, item.depth + 1, true, item.url);
          else if (internal && !allowed(to)) enqueue(to, item.depth + 1, false, item.url);
        }
      }
      page.indexable = computeIndexable(page);
    } catch (e) {
      page.error = e instanceof SsrfError ? `Bloqueado por seguridad: ${e.message}` : e instanceof Error ? e.message : "Error de red";
    }
    pages.set(item.url, page);
    summary.progress.crawled = pages.size;
  };

  const runQueue = async () => {
    const worker = async () => {
      while (!cancelled && !timeUp()) {
        const item = queue.shift();
        if (!item) {
          if (inFlight === 0) return;
          await sleep(30);
          continue;
        }
        inFlight++;
        try {
          await crawlOne(item);
        } finally {
          inFlight--;
        }
        summary.progress.queued = queue.length;
        await progress();
        if (delayMs) await sleep(delayMs);
      }
    };
    await Promise.all(Array.from({ length: cfg.concurrency }, worker));
  };
  if (!robotsFacts.blocksAll) {
    await runQueue();
    // URLs del sitemap no descubiertas por enlaces: se validan (sin expandir) con el presupuesto que quede.
    if (!cancelled && !timeUp()) {
      for (const u of sitemapUrls) if (isInternal(u)) enqueue(u, cfg.maxDepth, false, null);
      await runQueue();
    }
  } else {
    for (const u of [root, ...[...sitemapUrls].slice(0, 50)]) blocked.set(u, []);
  }
  summary.truncated = timeUp() ? "Se alcanzó el tiempo máximo de la auditoría" : seen.size >= cfg.maxPages ? `Se alcanzó el límite de ${cfg.maxPages} páginas` : null;

  const pageList = [...pages.values()];
  await progress(true);
  if (cancelled) {
    await storeRows(db, a, pageList, links, new Map(), [], [], []);
    await db
      .update(schema.seoAudit)
      .set({ finishedAt: new Date(), pagesCrawled: pages.size, summary: { ...summary, durationMs: Date.now() - started } as unknown as Record<string, unknown> })
      .where(eq(schema.seoAudit.id, a.id));
    return "cancelled";
  }

  // 5) Enlaces externos (HEAD con fallback a GET), con límite
  summary.progress.phase = "links";
  await progress(true);
  const external = new Map<string, LinkCheck>();
  const extTargets = cfg.checkExternal ? [...new Set(links.filter((l) => !l.internal).map((l) => l.to))].slice(0, cfg.maxExternalChecks) : [];
  let extIdx = 0;
  await Promise.all(
    Array.from({ length: Math.min(cfg.concurrency, 4) }, async () => {
      while (extIdx < extTargets.length && !cancelled && !timeUp()) {
        const u = extTargets[extIdx++] as string;
        const r = await checkLink(fetcher, u);
        if (r) external.set(u, r);
        if (delayMs) await sleep(Math.min(delayMs, 200));
      }
    }),
  );

  // 6) Google: PageSpeed (laboratorio) y CrUX (campo), solo con API key
  summary.progress.phase = "google";
  await progress(true);
  const finalRoot = resolveFinal(pages, root);
  summary.finalRootUrl = finalRoot;
  const lab: (LabResult & { accessibility: number | null; bestPractices: number | null; seo: number | null; labMetrics: Record<string, unknown> })[] = [];
  const field: FieldResult[] = [];
  const key = await getGoogleKeyForWorker(a.workspaceId);
  summary.google = { configured: Boolean(key), psi: { status: "skipped", errors: [] }, crux: { status: "skipped", errors: [] } };
  if (key && !cancelled) {
    const g = summary.google;
    const usage = await recordGoogleUsage(a.workspaceId, { psi: 0, crux: 0 });
    const targets = (cfg.lighthouseUrls.length ? cfg.lighthouseUrls : [finalRoot]).map((u) => normalizeUrl(u)).filter((u): u is string => Boolean(u) && isInternal(u as string));
    let psiOk = 0;
    let psiCalls = 0;
    psi: for (const u of targets) {
      for (const strategy of ["mobile", "desktop"] as const) {
        if (usage.psi + psiCalls >= PSI_DAILY_QUOTA) {
          g.psi.status = "quota";
          g.psi.errors.push("Se alcanzó la cuota diaria de PageSpeed Insights.");
          break psi;
        }
        psiCalls++;
        const r = await runPsi(key, u, strategy);
        if (r.ok) {
          psiOk++;
          lab.push({
            url: u,
            strategy,
            performance: r.data.performance,
            accessibility: r.data.accessibility,
            bestPractices: r.data.bestPractices,
            seo: r.data.seo,
            labMetrics: r.data.lab,
          });
        } else {
          g.psi.errors.push(`${strategy} ${u}: ${r.error.message}`);
          if (r.error.quota || r.error.invalidKey) {
            g.psi.status = r.error.quota ? "quota" : "error";
            break psi;
          }
        }
      }
    }
    if (g.psi.status === "skipped") g.psi.status = psiOk && !g.psi.errors.length ? "ok" : psiOk ? "partial" : "error";
    let cruxCalls = 0;
    let cruxData = 0;
    const cruxTargets: ({ origin: string } | { url: string })[] = [{ origin: new URL(finalRoot).origin }, { url: finalRoot }];
    crux: for (const target of cruxTargets) {
      for (const formFactor of ["PHONE", "DESKTOP"] as const) {
        if (usage.crux + cruxCalls >= CRUX_DAILY_QUOTA) {
          g.crux.status = "quota";
          break crux;
        }
        cruxCalls++;
        const r = await runCrux(key, target, formFactor);
        const urlOrOrigin: string = "origin" in target ? (target.origin as string) : (target.url as string);
        if (!r.ok) {
          g.crux.errors.push(`${formFactor} ${urlOrOrigin}: ${r.error.message}`);
          if (r.error.quota || r.error.invalidKey) {
            g.crux.status = r.error.quota ? "quota" : "error";
            break crux;
          }
          continue;
        }
        if (r.data) cruxData++;
        field.push({ urlOrOrigin, formFactor, hasData: Boolean(r.data), lcpP75: r.data?.lcpP75 ?? null, inpP75: r.data?.inpP75 ?? null, clsP75: r.data?.clsP75 ?? null });
      }
    }
    if (g.crux.status === "skipped") g.crux.status = cruxData ? "ok" : g.crux.errors.length && !field.length ? "error" : "no_data";
    await recordGoogleUsage(a.workspaceId, { psi: psiCalls, crux: cruxCalls }, [...g.psi.errors, ...g.crux.errors].at(-1) ?? null);
  }

  // 7) Problemas, puntaje y guardado
  summary.progress.phase = "issues";
  const site: SiteFacts = {
    rootUrl: finalRoot,
    robots: robotsFacts,
    sitemap: { found: smFound, error: smError, urls: sitemapUrls, checked: true },
    blocked,
    https: {
      rootIsHttps: new URL(finalRoot).protocol === "https:",
      hsts: Boolean((pages.get(finalRoot)?.headers ?? rootHeaders)["strict-transport-security"]),
      httpRedirectsToHttps,
    },
  };
  const detected = detectIssues({ pages: pageList, links, external, site, lab, field });
  const issues = detected.map((d) => ({ ...d, ...classify(d.code), fingerprint: fingerprint(d.code, d.url, d.key) }));
  // un fingerprint por auditoría (evita duplicados exactos)
  const uniq = [...new Map(issues.map((i) => [i.fingerprint, i])).values()];
  const score = computeScore(uniq, Math.max(1, pageList.filter((p) => p.isHtml && p.status === 200).length));
  const ttfbs = pageList
    .filter((p) => p.status === 200 && p.ttfbMs !== null)
    .map((p) => p.ttfbMs as number)
    .sort((x, y) => x - y);
  const pct = (q: number) => (ttfbs.length ? (ttfbs[Math.min(ttfbs.length - 1, Math.floor(q * ttfbs.length))] ?? null) : null);
  summary.counts = score.counts;
  summary.categories = score.categories as unknown as Record<string, Record<string, number>>;
  summary.penalties = score.penalties;
  summary.sitemap = {
    found: smFound,
    files: smFiles,
    urls: sitemapUrls.size,
    error: smError,
    notCrawled: [...sitemapUrls].filter((u) => !pages.has(u)).length,
    checked: true,
  };
  summary.https = site.https;
  summary.links = {
    internal: links.filter((l) => l.internal).length,
    external: links.filter((l) => !l.internal).length,
    externalChecked: external.size,
    brokenInternal: uniq.filter((i) => i.code === "broken_internal_link").length,
    brokenExternal: uniq.filter((i) => i.code === "broken_external_link").length,
  };
  summary.pages = {
    total: pageList.length,
    html: pageList.filter((p) => p.isHtml).length,
    indexable: pageList.filter((p) => p.indexable).length,
    ok: pageList.filter((p) => p.status === 200).length,
    redirects: pageList.filter((p) => p.status && p.status >= 300 && p.status < 400).length,
    errors: pageList.filter((p) => p.error || (p.status && p.status >= 400)).length,
    medianTtfbMs: pct(0.5),
    p90TtfbMs: pct(0.9),
  };
  summary.progress.phase = "done";
  summary.durationMs = Date.now() - started;

  // Regresión respecto de la auditoría completada anterior del mismo origen
  const [prev] = await db
    .select({ id: schema.seoAudit.id, score: schema.seoAudit.score, rootUrl: schema.seoAudit.rootUrl })
    .from(schema.seoAudit)
    .where(
      and(
        eq(schema.seoAudit.workspaceId, a.workspaceId),
        eq(schema.seoAudit.status, "completed"),
        ne(schema.seoAudit.id, a.id),
        isNull(schema.seoAudit.deletedAt),
        lt(schema.seoAudit.createdAt, a.createdAt),
      ),
    )
    .orderBy(desc(schema.seoAudit.createdAt))
    .limit(50)
    .then((rows) => rows.filter((r) => sameOrigin(r.rootUrl, a.rootUrl)));
  let regression: AuditSummary["regression"] = null;
  if (prev) {
    const prevCrit = await db
      .select({ fp: schema.seoIssue.fingerprint })
      .from(schema.seoIssue)
      .where(and(eq(schema.seoIssue.auditId, prev.id), eq(schema.seoIssue.severity, "critical")));
    const prevSet = new Set(prevCrit.map((r) => r.fp));
    const newCritical = uniq.filter((i) => i.severity === "critical" && !prevSet.has(i.fingerprint)).length;
    const delta = score.score - (prev.score ?? score.score);
    if (delta <= -5 || newCritical > 0) regression = { previousAuditId: prev.id, scoreDelta: delta, newCritical };
  }
  summary.regression = regression;

  const linkStatus = new Map<string, number | null>();
  for (const p of pageList) linkStatus.set(p.url, p.status);
  for (const [u, r] of external) linkStatus.set(u, r.status);

  await db.transaction(async (t) => {
    const [cur] = await t.select({ status: schema.seoAudit.status }).from(schema.seoAudit).where(eq(schema.seoAudit.id, a.id)).for("update");
    if (cur?.status === "cancelled") {
      cancelled = true;
      return;
    }
    await storeRows(t, a, pageList, links, linkStatus, uniq, lab, field);
    await t
      .update(schema.seoAudit)
      .set({
        status: "completed",
        finishedAt: new Date(),
        pagesCrawled: pageList.length,
        score: score.score,
        scoreFormulaVersion: SCORE_FORMULA_VERSION,
        summary: summary as unknown as Record<string, unknown>,
      })
      .where(eq(schema.seoAudit.id, a.id));
    await recordEvent(t, ctx, {
      type: "auditoria.completada",
      entityType: "seo_audit",
      entityId: a.id,
      summary: `Auditoría SEO de ${hostOf(a.rootUrl)} completada: ${score.score}/100, ${pageList.length} páginas`,
      payload: { score: score.score, pages: pageList.length, counts: score.counts },
    });
    if (regression) {
      const what = [
        regression.scoreDelta <= -5 ? `el puntaje bajó ${Math.abs(regression.scoreDelta)} puntos` : null,
        regression.newCritical ? `${regression.newCritical} problema${regression.newCritical === 1 ? "" : "s"} crítico${regression.newCritical === 1 ? "" : "s"} nuevo${regression.newCritical === 1 ? "" : "s"}` : null,
      ]
        .filter(Boolean)
        .join(" y ");
      await recordEvent(t, ctx, {
        type: "auditoria.regresion_detectada",
        entityType: "seo_audit",
        entityId: a.id,
        summary: `Regresión SEO en ${hostOf(a.rootUrl)}: ${what}`,
        payload: regression,
      });
      await notifyOwners(t, a.workspaceId, {
        type: "auditoria.regresion_detectada",
        title: `Regresión SEO en ${hostOf(a.rootUrl)}: ${what}`,
        body: `Puntaje ${score.score}/100 (${regression.scoreDelta >= 0 ? "+" : ""}${regression.scoreDelta}).`,
        entityId: a.id,
        dedupeKey: `seo:regression:${a.id}`,
      });
    }
  });
  if (cancelled) return "cancelled";
  return "completed";
}

function resolveFinal(pages: Map<string, CrawledPage>, start: string) {
  let cur = start;
  for (let i = 0; i < 10; i++) {
    const p = pages.get(cur);
    if (!p?.redirectTo || !pages.has(p.redirectTo)) return cur;
    cur = p.redirectTo;
  }
  return cur;
}

const KEEP_HEADERS = ["content-type", "x-robots-tag", "strict-transport-security", "location", "server", "cache-control", "content-encoding", "x-powered-by"];
function pickHeaders(h: Record<string, string>) {
  const o: Record<string, string> = {};
  for (const k of KEEP_HEADERS) if (h[k]) o[k] = h[k].slice(0, 300);
  return o;
}

async function fetchFollow(fetcher: Fetcher, url: string, opts: { maxBytes?: number; timeoutMs?: number } = {}) {
  let cur = url;
  for (let i = 0; i <= 5; i++) {
    const r = await fetcher(cur, { method: "GET", ...opts });
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      cur = new URL(r.headers.location, cur).toString();
      continue;
    }
    return r;
  }
  throw new Error("Demasiadas redirecciones");
}

async function checkLink(fetcher: Fetcher, url: string): Promise<LinkCheck | null> {
  const follow = async (method: "HEAD" | "GET") => {
    let cur = url;
    for (let i = 0; i <= 5; i++) {
      const r = await fetcher(cur, { method, maxBytes: 64 * 1024, timeoutMs: 10_000 });
      if (r.status >= 300 && r.status < 400 && r.headers.location) {
        cur = new URL(r.headers.location, cur).toString();
        continue;
      }
      return r.status;
    }
    throw new Error("Demasiadas redirecciones");
  };
  try {
    const s = await follow("HEAD");
    if ([400, 403, 405, 406, 501].includes(s)) return { status: await follow("GET"), error: null };
    return { status: s, error: null };
  } catch (e) {
    if (e instanceof SsrfError) return null;
    try {
      return { status: await follow("GET"), error: null };
    } catch (e2) {
      if (e2 instanceof SsrfError) return null;
      return { status: null, error: e2 instanceof Error ? e2.message.slice(0, 200) : "Error de red" };
    }
  }
}

async function storeRows(
  t: DbOrTx,
  a: Audit,
  pages: CrawledPage[],
  links: CrawledLink[],
  linkStatus: Map<string, number | null>,
  issues: { code: string; url: string | null; details: Record<string, unknown>; category: string; severity: string; fingerprint: string }[],
  lab: (LabResult & { accessibility: number | null; bestPractices: number | null; seo: number | null; labMetrics: Record<string, unknown> })[],
  field: FieldResult[],
) {
  const ws = a.workspaceId;
  // idempotente: si se reintenta, se reemplaza lo de esta auditoría
  for (const table of [schema.seoPage, schema.seoLink, schema.seoIssue, schema.seoLighthouse, schema.seoFieldMetrics])
    await t.delete(table).where(eq(table.auditId, a.id));
  for (const chunk of chunks(pages, 300))
    await t.insert(schema.seoPage).values(
      chunk.map((p) => ({
        workspaceId: ws,
        auditId: a.id,
        url: p.url,
        statusCode: p.status,
        redirectTo: p.redirectTo,
        title: p.parsed?.title?.slice(0, 1000) ?? null,
        metaDescription: p.parsed?.metaDescription?.slice(0, 2000) ?? null,
        h1: p.parsed?.h1.slice(0, 10).map((x) => x.slice(0, 500)) ?? null,
        canonical: p.canonical,
        robotsMeta: [p.parsed?.robotsMeta, p.headers["x-robots-tag"] ? `X-Robots-Tag: ${p.headers["x-robots-tag"]}` : null].filter(Boolean).join(" · ") || null,
        indexable: p.indexable,
        depth: p.depth,
        wordCount: p.parsed?.wordCount ?? null,
        sizeBytes: p.sizeBytes,
        ttfbMs: p.ttfbMs,
        structuredData: p.parsed ? p.parsed.jsonLd.map((j) => (j.ok ? { ok: true, types: j.types } : { ok: false, error: j.error })) : null,
        og: p.parsed
          ? {
              ...p.parsed.og,
              _meta: {
                error: p.error,
                contentType: p.headers["content-type"] ?? null,
                lang: p.parsed.lang,
                headings: p.parsed.headings.length,
                images: p.parsed.images.length,
                imagesNoAlt: p.parsed.images.filter((i) => i.alt === null).length,
                hreflang: p.parsed.hreflang.slice(0, 20),
              },
            }
          : { _meta: { error: p.error, contentType: p.headers["content-type"] ?? null } },
      })),
    );
  for (const chunk of chunks(links, 1000))
    await t.insert(schema.seoLink).values(
      chunk.map((l) => ({
        workspaceId: ws,
        auditId: a.id,
        fromUrl: l.from,
        toUrl: l.to,
        internal: l.internal,
        statusCode: linkStatus.get(l.to) ?? null,
        anchor: l.anchor || null,
        nofollow: l.nofollow,
      })),
    );
  for (const chunk of chunks(issues, 500))
    await t.insert(schema.seoIssue).values(
      chunk.map((i) => ({
        workspaceId: ws,
        auditId: a.id,
        code: i.code,
        category: i.category,
        severity: i.severity,
        url: i.url,
        details: i.details,
        fingerprint: i.fingerprint,
      })),
    );
  if (lab.length)
    await t.insert(schema.seoLighthouse).values(
      lab.map((l) => ({
        workspaceId: ws,
        auditId: a.id,
        url: l.url,
        strategy: l.strategy,
        performance: l.performance,
        accessibility: l.accessibility,
        bestPractices: l.bestPractices,
        seo: l.seo,
        labMetrics: l.labMetrics,
      })),
    );
  if (field.length)
    await t.insert(schema.seoFieldMetrics).values(
      field.map((f) => ({
        workspaceId: ws,
        auditId: a.id,
        urlOrOrigin: f.urlOrOrigin,
        formFactor: f.formFactor,
        lcpP75: f.lcpP75,
        inpP75: f.inpP75,
        clsP75: f.clsP75 === null ? null : String(f.clsP75),
        hasData: f.hasData,
      })),
    );
}

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Notificación in-app (campana) para dueños y admins del workspace. Idempotente por dedupeKey. */
export async function notifyOwners(
  t: DbOrTx,
  workspaceId: string,
  n: { type: string; title: string; body?: string; entityId: string; dedupeKey: string },
) {
  const owners = await t
    .select({ userId: schema.membership.userId })
    .from(schema.membership)
    .where(and(eq(schema.membership.workspaceId, workspaceId), inArray(schema.membership.role, ["owner", "admin"]), eq(schema.membership.status, "active")));
  for (const o of owners)
    await t
      .insert(schema.notification)
      .values({ workspaceId, userId: o.userId, type: n.type, title: n.title.slice(0, 200), body: n.body ?? null, entityType: "seo_audit", entityId: n.entityId, dedupeKey: n.dedupeKey })
      .onConflictDoNothing();
}
