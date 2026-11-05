import type { IssueCode } from "./catalog";
import { isValidHreflang, type ParsedPage, robotsDirectives } from "./html";

/** Datos del rastreo que consumen las reglas (puras, sin red ni base: se testean con fixtures). */
export type CrawledPage = {
  url: string;
  depth: number;
  status: number | null;
  redirectTo: string | null;
  error: string | null;
  headers: Record<string, string>;
  sizeBytes: number;
  ttfbMs: number | null;
  isHtml: boolean;
  parsed: ParsedPage | null;
  canonical: string | null;
  indexable: boolean;
};
export type CrawledLink = { from: string; to: string; internal: boolean; nofollow: boolean; anchor: string };
export type LinkCheck = { status: number | null; error: string | null };
export type SiteFacts = {
  rootUrl: string;
  robots: { found: boolean; status: number | null; invalidLines: number; blocksAll: boolean };
  sitemap: { found: boolean; error: string | null; urls: Set<string>; checked: boolean };
  blocked: Map<string, string[]>;
  https: { rootIsHttps: boolean; hsts: boolean; httpRedirectsToHttps: boolean | null };
};
export type LabResult = { url: string; strategy: string; performance: number | null };
export type FieldResult = { urlOrOrigin: string; formFactor: string; hasData: boolean; lcpP75: number | null; inpP75: number | null; clsP75: number | null };

export type DetectedIssue = { code: IssueCode; url: string | null; details: Record<string, unknown>; key?: string };

const MAX_SOURCES = 20;

/** ¿Es indexable? 200 + HTML + sin noindex (meta o X-Robots-Tag) + canonical propio o ausente. */
export function computeIndexable(p: Pick<CrawledPage, "status" | "isHtml" | "parsed" | "headers" | "url" | "canonical">): boolean {
  if (p.status !== 200 || !p.isHtml) return false;
  const d = robotsDirectives(p.parsed?.robotsMeta, p.headers["x-robots-tag"]);
  if (d.has("noindex") || d.has("none")) return false;
  if (p.canonical && p.canonical !== p.url) return false;
  return true;
}

/** Sigue redirecciones dentro de lo rastreado: saltos, destino final y si hay bucle. */
export function resolveRedirect(pages: Map<string, CrawledPage>, start: string, max = 10) {
  const hops: { url: string; status: number }[] = [];
  const seen = new Set<string>([start]);
  let cur = pages.get(start);
  while (cur && cur.redirectTo && cur.status && cur.status >= 300 && cur.status < 400) {
    hops.push({ url: cur.url, status: cur.status });
    if (seen.has(cur.redirectTo) || hops.length > max) return { hops, final: cur.redirectTo, finalStatus: null as number | null, loop: true };
    seen.add(cur.redirectTo);
    const next = pages.get(cur.redirectTo);
    if (!next) return { hops, final: cur.redirectTo, finalStatus: null as number | null, loop: false };
    cur = next;
  }
  return { hops, final: cur?.url ?? start, finalStatus: cur?.status ?? null, loop: false };
}

export function detectIssues(input: {
  pages: CrawledPage[];
  links: CrawledLink[];
  external: Map<string, LinkCheck>;
  site: SiteFacts;
  lab?: LabResult[];
  field?: FieldResult[];
}): DetectedIssue[] {
  const out: DetectedIssue[] = [];
  const add = (code: IssueCode, url: string | null, details: Record<string, unknown> = {}, key?: string) => out.push({ code, url, details, key });
  const byUrl = new Map(input.pages.map((p) => [p.url, p]));
  const { site } = input;

  // Fuentes (páginas que enlazan) por destino, para dar contexto en cada problema.
  const sources = new Map<string, Set<string>>();
  for (const l of input.links) {
    const s = sources.get(l.to) ?? new Set<string>();
    if (s.size < MAX_SOURCES) s.add(l.from);
    sources.set(l.to, s);
  }
  const src = (u: string) => [...(sources.get(u) ?? [])];

  // — Sitio —
  if (!site.robots.found) add("robots_missing", null, { status: site.robots.status });
  if (site.robots.blocksAll) add("robots_blocks_all", null);
  if (site.robots.invalidLines > 0) add("robots_invalid", null, { lines: site.robots.invalidLines });
  if (site.sitemap.checked) {
    if (!site.sitemap.found) add("sitemap_missing", null);
    else if (site.sitemap.error) add("sitemap_invalid", null, { error: site.sitemap.error });
  }
  if (!site.https.rootIsHttps) add("no_https", null, { url: site.rootUrl });
  else {
    if (!site.https.hsts) add("hsts_missing", null);
    if (site.https.httpRedirectsToHttps === false) add("http_not_redirected", null);
  }

  // — Páginas —
  const titles = new Map<string, string[]>();
  const descs = new Map<string, string[]>();
  for (const p of input.pages) {
    if (p.error) {
      add("fetch_error", p.url, { error: p.error, from: src(p.url) });
      continue;
    }
    if (p.status && p.status >= 500) add("http_5xx", p.url, { status: p.status, from: src(p.url) });
    // Si la enlazan páginas internas se reporta como enlace roto (abajo); acá solo la raíz o URLs del sitemap.
    else if (p.status && p.status >= 400 && !sources.has(p.url)) add("http_4xx", p.url, { status: p.status });
    if (p.status && p.status >= 300 && p.status < 400) {
      const r = resolveRedirect(byUrl, p.url);
      if (r.loop) add("redirect_loop", p.url, { hops: r.hops });
      else if (r.hops.length > 1) add("redirect_chain", p.url, { hops: r.hops, final: r.final });
      if ((p.status === 302 || p.status === 307) && p.redirectTo && byUrl.has(p.redirectTo))
        add("temporary_redirect", p.url, { status: p.status, to: p.redirectTo });
    }
    if (p.ttfbMs !== null && p.status === 200) {
      if (p.ttfbMs > 1800) add("very_slow_ttfb", p.url, { ttfbMs: p.ttfbMs });
      else if (p.ttfbMs > 800) add("slow_ttfb", p.url, { ttfbMs: p.ttfbMs });
    }
    if (p.status !== 200 || !p.isHtml || !p.parsed) continue;
    const h = p.parsed;
    if (p.sizeBytes > 500 * 1024) add("large_html", p.url, { sizeBytes: p.sizeBytes });
    const directives = robotsDirectives(h.robotsMeta, p.headers["x-robots-tag"]);
    const noindex = directives.has("noindex") || directives.has("none");
    if (noindex) add("noindex", p.url, { robots: h.robotsMeta, xRobotsTag: p.headers["x-robots-tag"] ?? null });
    if (h.canonicalCount > 1) add("canonical_multiple", p.url, { count: h.canonicalCount });
    if (!h.canonical) add("canonical_missing", p.url);
    else if (p.canonical && p.canonical !== p.url) {
      const target = byUrl.get(p.canonical);
      if (target && (target.status !== 200 || target.error)) add("canonical_to_error", p.url, { canonical: p.canonical, status: target.status });
    }
    const badLangs = h.hreflang.filter((x) => !isValidHreflang(x.lang)).map((x) => x.lang);
    if (badLangs.length) add("hreflang_invalid", p.url, { codes: badLangs });

    const title = h.title?.trim() ?? "";
    if (!title) add("title_missing", p.url);
    else {
      if (title.length > 60) add("title_too_long", p.url, { title, length: title.length });
      else if (title.length < 15) add("title_too_short", p.url, { title, length: title.length });
      if (!noindex) titles.set(title, [...(titles.get(title) ?? []), p.url]);
    }
    const desc = h.metaDescription?.trim() ?? "";
    if (!desc) add("meta_description_missing", p.url);
    else {
      if (desc.length < 70 || desc.length > 160) add("meta_description_length", p.url, { length: desc.length });
      if (!noindex) descs.set(desc, [...(descs.get(desc) ?? []), p.url]);
    }
    if (!h.h1.length || h.h1.every((x) => !x)) add("h1_missing", p.url);
    else if (h.h1.length > 1) add("h1_multiple", p.url, { h1: h.h1.slice(0, 5) });
    if (h.wordCount < 200) add("thin_content", p.url, { words: h.wordCount });
    const noAlt = h.images.filter((i) => i.alt === null);
    if (noAlt.length) add("img_alt_missing", p.url, { count: noAlt.length, images: noAlt.slice(0, 10).map((i) => i.src) });
    if (!h.lang) add("lang_missing", p.url);
    if (!h.viewport) add("viewport_missing", p.url);
    for (const j of h.jsonLd) {
      if (!j.ok) add("jsonld_invalid", p.url, { error: j.error });
      else if (!j.types.length) add("jsonld_missing_type", p.url);
    }
    if (p.url === site.rootUrl && !h.jsonLd.some((j) => j.ok && j.types.length)) add("jsonld_missing_home", p.url);
    const missingOg = ["og:title", "og:description", "og:image"].filter((k) => !h.og[k]);
    if (missingOg.length) add("og_missing", p.url, { missing: missingOg });
    if (p.url.startsWith("https:")) {
      const mixed = [...h.resources.map((r) => r.url), ...h.formActions].filter((u) => /^http:\/\//i.test(u.trim()));
      if (mixed.length) add("mixed_content", p.url, { count: mixed.length, resources: mixed.slice(0, 10) });
    }
    if (site.sitemap.found && !site.sitemap.error && site.sitemap.urls.size && p.indexable && !site.sitemap.urls.has(p.url)) add("not_in_sitemap", p.url);
  }

  for (const [title, urls] of titles)
    if (urls.length > 1) for (const u of urls) add("title_duplicate", u, { title, others: urls.filter((x) => x !== u).slice(0, 10), count: urls.length });
  for (const [desc, urls] of descs)
    if (urls.length > 1) for (const u of urls) add("meta_description_duplicate", u, { description: desc, others: urls.filter((x) => x !== u).slice(0, 10) });

  // — Enlaces —
  const brokenInternal = new Set<string>();
  const toRedirect = new Set<string>();
  for (const l of input.links) {
    if (l.internal) {
      const t = byUrl.get(l.to);
      if (!t) continue;
      if (t.status && t.status >= 400 && t.status < 500) brokenInternal.add(l.to);
      else if (t.status && t.status >= 300 && t.status < 400) toRedirect.add(l.to);
    }
  }
  for (const u of brokenInternal) add("broken_internal_link", u, { status: byUrl.get(u)?.status ?? null, from: src(u) });
  for (const u of toRedirect) add("internal_link_to_redirect", u, { to: byUrl.get(u)?.redirectTo ?? null, from: src(u) });
  for (const [u, r] of input.external) {
    const bad = r.error ? true : r.status !== null && r.status >= 400 && r.status !== 429 && r.status !== 403 && r.status !== 401;
    if (bad) add("broken_external_link", u, { status: r.status, error: r.error, from: src(u) });
  }
  for (const [u, from] of site.blocked) add("blocked_by_robots", u, { from: from.slice(0, MAX_SOURCES) });

  // — Sitemap vs. rastreo —
  if (site.sitemap.found && !site.sitemap.error) {
    for (const u of site.sitemap.urls) {
      if (site.blocked.has(u) || site.robots.blocksAll) {
        add("sitemap_url_blocked", u);
        continue;
      }
      const p = byUrl.get(u);
      if (!p) continue;
      if (p.error || (p.status !== null && p.status !== 200)) add("sitemap_url_error", u, { status: p.status, error: p.error });
      else if (p.isHtml && p.parsed && robotsDirectives(p.parsed.robotsMeta, p.headers["x-robots-tag"]).has("noindex")) add("sitemap_url_noindex", u);
    }
  }

  // — Google: laboratorio (Lighthouse) y campo (CrUX) —
  for (const r of input.lab ?? []) {
    if (r.performance === null) continue;
    if (r.performance < 50) add("lighthouse_performance_poor", r.url, { strategy: r.strategy, performance: r.performance }, r.strategy);
    else if (r.performance < 90) add("lighthouse_performance_average", r.url, { strategy: r.strategy, performance: r.performance }, r.strategy);
  }
  for (const f of input.field ?? []) {
    if (!f.hasData) continue;
    const u = f.urlOrOrigin;
    const d = { formFactor: f.formFactor, lcpP75: f.lcpP75, inpP75: f.inpP75, clsP75: f.clsP75 };
    if (f.lcpP75 !== null) {
      if (f.lcpP75 > 4000) add("cwv_lcp_poor", u, d, f.formFactor);
      else if (f.lcpP75 > 2500) add("cwv_lcp_needs_improvement", u, d, f.formFactor);
    }
    if (f.inpP75 !== null) {
      if (f.inpP75 > 500) add("cwv_inp_poor", u, d, f.formFactor);
      else if (f.inpP75 > 200) add("cwv_inp_needs_improvement", u, d, f.formFactor);
    }
    if (f.clsP75 !== null) {
      if (f.clsP75 > 0.25) add("cwv_cls_poor", u, d, f.formFactor);
      else if (f.clsP75 > 0.1) add("cwv_cls_needs_improvement", u, d, f.formFactor);
    }
  }
  return out;
}
