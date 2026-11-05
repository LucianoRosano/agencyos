import { gzipSync } from "node:zlib";
import { decodeEntities, isValidHreflang, parseHtml, robotsDirectives } from "@agencyos/modules/seo/html";
import { blocksEverything, groupFor, isAllowed, parseRobots } from "@agencyos/modules/seo/robots";
import { parseSitemap, sitemapText } from "@agencyos/modules/seo/sitemap";
import { describe, expect, it } from "vitest";

const UA = "AGENCYOS-SEO-Auditor/1.0 (+lucianorosanott@gmail.com)";

describe("parser HTML del auditor", () => {
  const html = `<!DOCTYPE html><html lang="es-AR"><head>
    <meta charset="utf-8"><title> Tienda &amp; Café — Inicio </title>
    <meta name="description" content="Productos &quot;ricos&quot; en Córdoba">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width">
    <link rel="canonical" href="https://ej.com/">
    <link rel="alternate" hreflang="es-AR" href="https://ej.com/">
    <link rel="alternate" hreflang="castellano" href="https://ej.com/x">
    <link rel="stylesheet" href="http://cdn.ej.com/a.css">
    <meta property="og:title" content="OG título"><meta property="og:image" content="/og.png">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":["WebSite","Thing"]}]}</script>
    <script type="application/ld+json">{ roto </script>
    <script>var x = "<a href='/no-es-enlace'>no</a>";</script>
    <style>h1{color:red}</style>
  </head><body>
    <!-- <a href="/comentado">no</a> -->
    <h1>Hola <span>mundo</span></h1><h2>Sub</h2><h1>Otro</h1>
    <p>Uno dos tres cuatro cinco.</p>
    <a href="/productos" rel="nofollow sponsored">Ver <b>productos</b></a>
    <a href='https://otro.com/x'>Externo</a>
    <a>sin href</a>
    <img src="/a.png" alt="Foto"><img src="/b.png"><img src="/c.png" alt="">
    <form action="http://ej.com/enviar"></form>
  </body></html>`;
  const p = parseHtml(html);

  it("extrae título, meta, lang y canonical con entidades decodificadas", () => {
    expect(p.title).toBe("Tienda & Café — Inicio");
    expect(p.metaDescription).toBe('Productos "ricos" en Córdoba');
    expect(p.robotsMeta).toBe("noindex, nofollow");
    expect(p.viewport).toBe("width=device-width");
    expect(p.lang).toBe("es-AR");
    expect(p.canonical).toBe("https://ej.com/");
    expect(p.canonicalCount).toBe(1);
  });
  it("encabezados con texto anidado y varios H1", () => {
    expect(p.h1).toEqual(["Hola mundo", "Otro"]);
    expect(p.headings.map((h) => h.level)).toEqual([1, 2, 1]);
  });
  it("enlaces: ignora scripts y comentarios, detecta nofollow y texto", () => {
    expect(p.links.map((l) => l.href)).toEqual(["/productos", "https://otro.com/x"]);
    expect(p.links[0]).toMatchObject({ text: "Ver productos", nofollow: true });
  });
  it("imágenes: alt ausente ≠ alt vacío", () => {
    expect(p.images.map((i) => i.alt)).toEqual(["Foto", null, ""]);
  });
  it("JSON-LD válido (con @graph y @type múltiple) e inválido", () => {
    expect(p.jsonLd[0]).toMatchObject({ ok: true, types: ["Organization", "WebSite", "Thing"] });
    expect(p.jsonLd[1]?.ok).toBe(false);
  });
  it("Open Graph, hreflang y recursos para mixed content", () => {
    expect(p.og["og:title"]).toBe("OG título");
    expect(p.hreflang.map((h) => h.lang)).toEqual(["es-AR", "castellano"]);
    expect(p.resources.some((r) => r.url === "http://cdn.ej.com/a.css")).toBe(true);
    expect(p.formActions).toEqual(["http://ej.com/enviar"]);
  });
  it("cuenta palabras visibles (sin script/style/head)", () => {
    expect(p.wordCount).toBeGreaterThanOrEqual(10);
    expect(p.wordCount).toBeLessThan(25);
  });
  it("tolera HTML roto sin cerrar", () => {
    const r = parseHtml("<title>Sin cierre<h1>Título <a href='/x'>link");
    expect(r.h1[0]).toContain("Título");
    expect(r.links[0]?.href).toBe("/x");
  });
  it("utilidades: entidades, hreflang, directivas robots", () => {
    expect(decodeEntities("&#233;&#x41;&ntilde;&nada;")).toBe("éAñ&nada;");
    expect(isValidHreflang("es-AR")).toBe(true);
    expect(isValidHreflang("x-default")).toBe(true);
    expect(isValidHreflang("es_AR")).toBe(false);
    expect([...robotsDirectives("index, follow", "googlebot: noindex")]).toContain("noindex");
  });
});

describe("robots.txt", () => {
  const txt = `# comentario
User-agent: Googlebot
Disallow: /solo-google/

User-agent: *
Disallow: /privado/
Allow: /privado/publico.html
Disallow: /*.pdf$
Disallow: /buscar?
Crawl-delay: 2
esto no es válido

User-agent: AGENCYOS-SEO-Auditor
User-agent: OtroBot
Disallow: /no-agencyos/

Sitemap: https://ej.com/sitemap.xml`;
  const r = parseRobots(txt);

  it("parsea grupos, sitemaps y líneas inválidas", () => {
    expect(r.groups).toHaveLength(3);
    expect(r.sitemaps).toEqual(["https://ej.com/sitemap.xml"]);
    expect(r.invalidLines).toBe(1);
  });
  it("elige el grupo más específico para el user-agent del auditor", () => {
    const g = groupFor(r, UA);
    expect(g?.agents).toContain("agencyos-seo-auditor");
    expect(isAllowed(g, "/no-agencyos/x")).toBe(false);
    expect(isAllowed(g, "/privado/x")).toBe(true); // su grupo no bloquea /privado/
  });
  it("comodines, $ y Allow más específico", () => {
    const g = groupFor(parseRobots(txt.replace(/User-agent: AGENCYOS-SEO-Auditor\n/, "")), UA);
    expect(g?.crawlDelay).toBe(2);
    expect(isAllowed(g, "/privado/secreto")).toBe(false);
    expect(isAllowed(g, "/privado/publico.html")).toBe(true);
    expect(isAllowed(g, "/docs/manual.pdf")).toBe(false);
    expect(isAllowed(g, "/docs/manual.pdf?v=1")).toBe(true);
    expect(isAllowed(g, "/buscar?q=x")).toBe(false);
    expect(isAllowed(g, "/robots.txt")).toBe(true);
    expect(isAllowed(g, "/")).toBe(true);
  });
  it("Disallow: / bloquea todo; Disallow vacío permite todo", () => {
    expect(blocksEverything(groupFor(parseRobots("User-agent: *\nDisallow: /"), UA))).toBe(true);
    expect(blocksEverything(groupFor(parseRobots("User-agent: *\nDisallow:"), UA))).toBe(false);
    expect(blocksEverything(groupFor(parseRobots(""), UA))).toBe(false);
  });
});

describe("sitemap.xml", () => {
  it("urlset, índice e inválidos", () => {
    expect(parseSitemap('<?xml version="1.0"?><urlset><url><loc>https://ej.com/a?x=1&amp;y=2</loc></url></urlset>')).toEqual({
      kind: "urlset",
      locs: ["https://ej.com/a?x=1&y=2"],
    });
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://ej.com/s1.xml</loc></sitemap></sitemapindex>").kind).toBe("index");
    expect(parseSitemap("<html>no</html>").kind).toBe("invalid");
    expect(parseSitemap("<urlset></urlset>").error).toMatch(/loc/);
  });
  it("descomprime .gz por firma", () => {
    expect(sitemapText(gzipSync(Buffer.from("<urlset/>")))).toBe("<urlset/>");
  });
});
