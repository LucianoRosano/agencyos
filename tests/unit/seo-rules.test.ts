import { ISSUES, SEO_CATEGORIES } from "@agencyos/modules/seo/catalog";
import { parseCrux, parsePsi } from "@agencyos/modules/seo/google";
import { parseHtml } from "@agencyos/modules/seo/html";
import { type CrawledPage, computeIndexable, detectIssues, resolveRedirect, type SiteFacts } from "@agencyos/modules/seo/rules";
import { computeScore, fingerprint, normalizeUrl, SCORE_FORMULA_VERSION } from "@agencyos/modules/seo/score";
import { describe, expect, it } from "vitest";

const R = "https://ej.com/";
const facts = (over: Partial<SiteFacts> = {}): SiteFacts => ({
  rootUrl: R,
  robots: { found: true, status: 200, invalidLines: 0, blocksAll: false },
  sitemap: { found: true, error: null, urls: new Set([R]), checked: true },
  blocked: new Map(),
  https: { rootIsHttps: true, hsts: true, httpRedirectsToHttps: true },
  ...over,
});
function pg(url: string, html: string, over: Partial<CrawledPage> = {}): CrawledPage {
  const parsed = parseHtml(html);
  const p: CrawledPage = {
    url,
    depth: 0,
    status: 200,
    redirectTo: null,
    error: null,
    headers: {},
    sizeBytes: html.length,
    ttfbMs: 100,
    isHtml: true,
    parsed,
    canonical: parsed.canonical ? normalizeUrl(parsed.canonical, url) : null,
    indexable: false,
    ...over,
  };
  p.indexable = computeIndexable(p);
  return p;
}
const GOOD = `<html lang="es"><head><title>Un título correcto para la página</title><meta name="viewport" content="width=device-width">
<meta name="description" content="${"Descripción suficientemente larga para pasar el control de longitud mínima de setenta.".padEnd(90, " x")}">
<link rel="canonical" href="https://ej.com/"><meta property="og:title" content="a"><meta property="og:description" content="b"><meta property="og:image" content="c">
<script type="application/ld+json">{"@type":"Organization"}</script></head><body><h1>Hola</h1><p>${"palabra ".repeat(250)}</p></body></html>`;

describe("reglas de problemas", () => {
  it("una página correcta no genera problemas", () => {
    expect(detectIssues({ pages: [pg(R, GOOD)], links: [], external: new Map(), site: facts() })).toEqual([]);
  });

  it("detecta problemas de contenido, social, datos estructurados y seguridad", () => {
    const bad = `<html><head><title>Corto</title><link rel="stylesheet" href="http://cdn/x.css"><script type="application/ld+json">{x}</script></head>
      <body><h1>A</h1><h1>B</h1><img src="a.png"><p>poco</p></body></html>`;
    const codes = detectIssues({
      pages: [pg("https://ej.com/x", bad, { ttfbMs: 2000 })],
      links: [],
      external: new Map(),
      site: facts({ https: { rootIsHttps: true, hsts: false, httpRedirectsToHttps: false } }),
    }).map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "title_too_short",
        "meta_description_missing",
        "h1_multiple",
        "img_alt_missing",
        "thin_content",
        "lang_missing",
        "viewport_missing",
        "jsonld_invalid",
        "og_missing",
        "mixed_content",
        "very_slow_ttfb",
        "canonical_missing",
        "hsts_missing",
        "http_not_redirected",
        "not_in_sitemap",
      ]),
    );
  });

  it("indexabilidad: noindex por meta o X-Robots-Tag y canonical a otra URL", () => {
    expect(pg(R, GOOD).indexable).toBe(true);
    expect(pg(R, GOOD.replace("<title>", '<meta name="robots" content="noindex"><title>')).indexable).toBe(false);
    expect(pg(R, GOOD, { headers: { "x-robots-tag": "noindex" } }).indexable).toBe(false);
    expect(pg("https://ej.com/?utm=1", GOOD).indexable).toBe(false);
  });

  it("duplicados de título y description entre páginas indexables", () => {
    const a = pg("https://ej.com/a", GOOD.replace("https://ej.com/", "https://ej.com/a"));
    const b = pg("https://ej.com/b", GOOD.replace("https://ej.com/", "https://ej.com/b"));
    const issues = detectIssues({ pages: [a, b], links: [], external: new Map(), site: facts({ sitemap: { found: false, error: null, urls: new Set(), checked: true } }) });
    expect(issues.filter((i) => i.code === "title_duplicate").map((i) => i.url)).toEqual(["https://ej.com/a", "https://ej.com/b"]);
    expect(issues.some((i) => i.code === "meta_description_duplicate")).toBe(true);
    expect(issues.some((i) => i.code === "sitemap_missing")).toBe(true);
  });

  it("redirecciones: cadena, bucle y enlaces rotos internos/externos", () => {
    const r1: CrawledPage = { ...pg("https://ej.com/r1", ""), status: 301, redirectTo: "https://ej.com/r2", isHtml: false, parsed: null };
    const r2: CrawledPage = { ...pg("https://ej.com/r2", ""), status: 302, redirectTo: "https://ej.com/", isHtml: false, parsed: null };
    const l1: CrawledPage = { ...pg("https://ej.com/l1", ""), status: 301, redirectTo: "https://ej.com/l2", isHtml: false, parsed: null };
    const l2: CrawledPage = { ...pg("https://ej.com/l2", ""), status: 301, redirectTo: "https://ej.com/l1", isHtml: false, parsed: null };
    const gone: CrawledPage = { ...pg("https://ej.com/gone", ""), status: 404, isHtml: false, parsed: null };
    const pages = [pg(R, GOOD), r1, r2, l1, l2, gone];
    expect(resolveRedirect(new Map(pages.map((p) => [p.url, p])), r1.url)).toMatchObject({ final: R, loop: false });
    const issues = detectIssues({
      pages,
      links: [
        { from: R, to: "https://ej.com/gone", internal: true, nofollow: false, anchor: "x" },
        { from: R, to: "https://ej.com/r1", internal: true, nofollow: false, anchor: "x" },
        { from: R, to: "https://fuera.com/404", internal: false, nofollow: false, anchor: "x" },
      ],
      external: new Map([
        ["https://fuera.com/404", { status: 404, error: null }],
        ["https://fuera.com/403", { status: 403, error: null }],
      ]),
      site: facts(),
    });
    const by = (c: string) => issues.filter((i) => i.code === c).map((i) => i.url);
    expect(by("redirect_chain")).toEqual(["https://ej.com/r1"]);
    expect(by("redirect_loop")).toContain("https://ej.com/l1");
    expect(by("temporary_redirect")).toEqual(["https://ej.com/r2"]);
    expect(by("broken_internal_link")).toEqual(["https://ej.com/gone"]);
    expect(by("http_4xx")).toEqual([]); // enlazada → se informa como enlace roto, sin duplicar
    expect(by("broken_external_link")).toEqual(["https://fuera.com/404"]); // 403 no se cuenta como roto
    expect(issues.find((i) => i.code === "broken_internal_link")?.details.from).toEqual([R]);
  });

  it("robots y sitemap: bloquea todo, URL del sitemap bloqueada o con error", () => {
    const issues = detectIssues({
      pages: [{ ...pg("https://ej.com/vieja", ""), status: 410, isHtml: false, parsed: null }],
      links: [],
      external: new Map(),
      site: facts({
        robots: { found: true, status: 200, invalidLines: 2, blocksAll: true },
        sitemap: { found: true, error: null, urls: new Set(["https://ej.com/vieja", "https://ej.com/privado"]), checked: true },
        blocked: new Map([["https://ej.com/privado", []]]),
      }),
    }).map((i) => `${i.code} ${i.url ?? ""}`);
    expect(issues).toEqual(expect.arrayContaining(["robots_blocks_all ", "robots_invalid ", "sitemap_url_blocked https://ej.com/privado"]));
  });

  it("Lighthouse y CrUX con umbrales oficiales; sin datos de campo no genera problemas", () => {
    const issues = detectIssues({
      pages: [],
      links: [],
      external: new Map(),
      site: facts({ sitemap: { found: true, error: null, urls: new Set(), checked: false } }),
      lab: [
        { url: R, strategy: "mobile", performance: 42 },
        { url: R, strategy: "desktop", performance: 95 },
      ],
      field: [
        { urlOrOrigin: "https://ej.com", formFactor: "PHONE", hasData: true, lcpP75: 3000, inpP75: 600, clsP75: 0.05 },
        { urlOrOrigin: R, formFactor: "PHONE", hasData: false, lcpP75: null, inpP75: null, clsP75: null },
      ],
    }).map((i) => i.code);
    expect(issues.sort()).toEqual(["cwv_inp_poor", "cwv_lcp_needs_improvement", "lighthouse_performance_poor"]);
  });

  it("cada código del catálogo tiene categoría válida, explicación y cómo corregirlo", () => {
    for (const [code, d] of Object.entries(ISSUES)) {
      expect(SEO_CATEGORIES, code).toContain(d.category);
      expect(d.why.length, code).toBeGreaterThan(20);
      expect(d.fix.length, code).toBeGreaterThan(20);
    }
  });
});

describe("puntaje y fingerprint", () => {
  it("fórmula v1: peso × (0,5 + 0,5 × afectadas/rastreadas); sitio completo = ratio 1", () => {
    expect(computeScore([], 10)).toMatchObject({ score: 100, version: SCORE_FORMULA_VERSION });
    // 1 de 10 páginas con un problema alto: 8 × (0,5 + 0,05) = 4,4 → 96
    expect(computeScore([{ code: "title_missing", severity: "high", category: "content", url: "https://ej.com/a" }], 10).score).toBe(96);
    // problema crítico de todo el sitio: 15 → 85
    const r = computeScore([{ code: "robots_blocks_all", severity: "critical", category: "indexing", url: null }], 10);
    expect(r.score).toBe(85);
    expect(r.categories.indexing.critical).toBe(1);
    expect(r.categories.indexing.score).toBe(85);
    expect(r.categories.content.score).toBe(100);
    // nunca baja de 0
    const many = Array.from({ length: 30 }, (_, i) => ({ code: `x${i}`, severity: "critical", category: "links", url: null }));
    expect(computeScore(many, 1).score).toBe(0);
  });

  it("fingerprint estable: ignora fragmento, mayúsculas del host y puerto por defecto", () => {
    const a = fingerprint("title_missing", "https://EJ.com:443/a#x");
    expect(a).toBe(fingerprint("title_missing", "https://ej.com/a"));
    expect(a).not.toBe(fingerprint("title_missing", "https://ej.com/b"));
    expect(a).not.toBe(fingerprint("h1_missing", "https://ej.com/a"));
    expect(fingerprint("no_https", null)).toHaveLength(32);
    expect(fingerprint("lighthouse_performance_poor", R, "mobile")).not.toBe(fingerprint("lighthouse_performance_poor", R, "desktop"));
  });

  it("normalizeUrl resuelve relativas y descarta esquemas no web", () => {
    expect(normalizeUrl("../b?x=1#f", "https://ej.com/a/c")).toBe("https://ej.com/b?x=1");
    expect(normalizeUrl("mailto:a@b.c")).toBeNull();
  });
});

describe("respuestas de Google (fixtures, sin red)", () => {
  it("PageSpeed: puntajes 0–100 tal como los devuelve Google y métricas de laboratorio", () => {
    const r = parsePsi({
      lighthouseResult: {
        categories: { performance: { score: 0.47 }, accessibility: { score: 0.9 }, "best-practices": { score: 1 }, seo: { score: 0.83 } },
        audits: {
          "largest-contentful-paint": { numericValue: 4123.4 },
          "cumulative-layout-shift": { numericValue: 0.1234 },
          "total-blocking-time": { numericValue: 310 },
        },
      },
    });
    expect(r).toMatchObject({ performance: 47, accessibility: 90, bestPractices: 100, seo: 83 });
    expect(r.lab).toMatchObject({ lcpMs: 4123, cls: 0.123, tbtMs: 310, fcpMs: null });
    expect(() => parsePsi({})).toThrow();
  });
  it("CrUX: p75 de LCP, INP y CLS (CLS llega como string)", () => {
    expect(
      parseCrux({
        record: {
          metrics: {
            largest_contentful_paint: { percentiles: { p75: 2300 } },
            interaction_to_next_paint: { percentiles: { p75: 180 } },
            cumulative_layout_shift: { percentiles: { p75: "0.07" } },
          },
          collectionPeriod: { lastDate: { year: 2026, month: 10, day: 30 } },
        },
      }),
    ).toEqual({ lcpP75: 2300, inpP75: 180, clsP75: 0.07, period: "2026-10-30" });
  });
});
