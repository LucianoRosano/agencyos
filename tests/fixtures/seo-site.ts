import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Sitio de prueba LOCAL para el auditor SEO (integración y e2e). Nunca se pega a sitios reales.
 * Versión 1: problemas conocidos. Versión 2: corrige algunos y agrega un error 5xx (regresión).
 * `localhost:<puerto>` se usa como "dominio externo" (distinto host que 127.0.0.1).
 */
export type SeoFixture = { url: string; port: number; setVersion: (v: 1 | 2) => void; hits: string[]; close: () => Promise<void> };

const page = (o: {
  title?: string;
  desc?: string;
  h1?: string[];
  body?: string;
  canonical?: string;
  lang?: boolean;
  og?: boolean;
  jsonld?: string;
  robots?: string;
  extraHead?: string;
}) => `<!doctype html>
<html${o.lang === false ? "" : ' lang="es-AR"'}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${o.title !== undefined ? `<title>${o.title}</title>` : ""}
${o.desc ? `<meta name="description" content="${o.desc}">` : ""}
${o.robots ? `<meta name="robots" content="${o.robots}">` : ""}
${o.canonical ? `<link rel="canonical" href="${o.canonical}">` : ""}
${o.og === false ? "" : `<meta property="og:title" content="${o.title ?? ""}"><meta property="og:description" content="${o.desc ?? ""}"><meta property="og:image" content="/og.png">`}
${o.jsonld ? `<script type="application/ld+json">${o.jsonld}</script>` : ""}
${o.extraHead ?? ""}
</head>
<body>
${(o.h1 ?? []).map((h) => `<h1>${h}</h1>`).join("\n")}
${o.body ?? ""}
</body>
</html>`;

const LOREM = Array.from({ length: 260 }, (_, i) => `palabra${i}`).join(" ");
const DESC = "Agencia de desarrollo web en Buenos Aires: sitios, tiendas WooCommerce y SEO técnico para pymes argentinas.";

export async function startSeoFixture(): Promise<SeoFixture> {
  let version: 1 | 2 = 1;
  const hits: string[] = [];
  let base = "";
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    hits.push(`${req.method} ${req.headers.host} ${path} ${req.headers["user-agent"] ?? ""}`);
    const html = (body: string, status = 200) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    const host = req.headers.host ?? "";
    if (host.startsWith("localhost")) {
      // "sitio externo"
      if (path === "/externo-ok") return html("<p>ok</p>");
      if (path === "/externo-sin-head" && req.method === "HEAD") {
        res.writeHead(405);
        return res.end();
      }
      if (path === "/externo-sin-head") return html("<p>ok con GET</p>");
      return html("no existe", 404);
    }
    switch (path) {
      case "/robots.txt":
        res.writeHead(200, { "content-type": "text/plain" });
        return res.end(`User-agent: *\nDisallow: /privado/\n\nUser-agent: OtroBot\nDisallow: /\n\nSitemap: ${base}/sitemap.xml\n`);
      case "/sitemap.xml":
        res.writeHead(200, { "content-type": "application/xml" });
        return res.end(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[
            "/",
            "/servicios",
            "/contacto",
            "/privado/panel",
            "/vieja",
            "/solo-sitemap",
          ]
            .map((p) => `<url><loc>${base}${p}</loc></url>`)
            .join("")}</urlset>`,
        );
      case "/":
        return html(
          page({
            title: "Agencia Fixture · Desarrollo web y SEO",
            desc: DESC,
            h1: ["Desarrollo web para pymes"],
            canonical: `${base}/`,
            jsonld: JSON.stringify({ "@context": "https://schema.org", "@type": "Organization", name: "Agencia Fixture" }),
            body: `<p>${LOREM}</p>
<nav><a href="/servicios">Servicios</a> <a href="/contacto">Contacto</a> <a href="/nosotros">Nosotros</a>
<a href="/vieja">Página vieja</a> <a href="/redir">Promo</a> <a href="/privado/panel">Panel</a> <a href="/lenta">Lenta</a>
<a href="mailto:hola@example.com">Mail</a> <a href="#top">Arriba</a>
<a href="http://localhost:${new URL(base).port}/externo-ok">Externo ok</a>
<a href="http://localhost:${new URL(base).port}/externo-roto">Externo roto</a>
<a href="http://localhost:${new URL(base).port}/externo-sin-head" rel="nofollow">Externo sin HEAD</a></nav>
<img src="/logo.png" alt="Logo de la agencia">`,
          }),
        );
      case "/servicios":
        return html(
          page({
            title: "Servicios · Agencia Fixture",
            desc: version === 2 ? DESC.replace("Agencia", "Servicios de agencia") : undefined,
            h1: ["Servicios", "Otro H1"],
            canonical: `${base}/servicios`,
            jsonld: "{ invalido: true, }",
            body: `<p>${LOREM}</p><img src="/foto.jpg"><img src="/deco.png" alt=""><a href="/">Inicio</a> <a href="/nosotros">Nosotros</a>`,
          }),
        );
      case "/contacto":
        return html(
          page({ title: "Contacto", desc: DESC, h1: ["Contacto"], robots: "noindex, follow", canonical: `${base}/contacto`, body: `<p>${LOREM}</p>` }),
        );
      case "/nosotros":
        if (version === 2) return html("<h1>Error</h1>", 500);
        return html(page({ desc: DESC, h1: ["Nosotros"], og: false, lang: false, canonical: `${base}/nosotros`, body: "<p>Somos pocos.</p>" }));
      case "/vieja":
        return html("<h1>No encontrada</h1>", 404);
      case "/redir":
        res.writeHead(301, { location: "/redir2" });
        return res.end();
      case "/redir2":
        res.writeHead(302, { location: "/servicios" });
        return res.end();
      case "/lenta":
        setTimeout(
          () => html(page({ title: "Página lenta de la agencia", desc: DESC, h1: ["Lenta"], canonical: `${base}/lenta`, body: `<p>${LOREM}</p>` })),
          900,
        );
        return;
      case "/solo-sitemap":
        return html(
          page({ title: "Solo en el sitemap de la agencia", desc: DESC, h1: ["Huérfana"], canonical: `${base}/solo-sitemap`, body: `<p>${LOREM}</p>` }),
        );
      case "/privado/panel":
        return html(page({ title: "Panel privado", h1: ["Panel"] }));
      default:
        return html("no existe", 404);
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
  return {
    url: `${base}/`,
    port,
    hits,
    setVersion: (v) => {
      version = v;
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
