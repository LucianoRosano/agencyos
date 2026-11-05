import { request as httpRequest } from "node:http";
import { type SafeResponse, safeFetch } from "../shared/safe-fetch";

/** User-agent identificable del auditor (docs/02 §M07). */
export const SEO_USER_AGENT = "AGENCYOS-SEO-Auditor/1.0 (+lucianorosanott@gmail.com)";

/**
 * Opción EXPLÍCITA y SOLO PARA TESTS: permite rastrear un servidor HTTP local de prueba (127.0.0.1/localhost, cualquier puerto).
 * Requiere las DOS condiciones: `NODE_ENV=test` y `SEO_ALLOW_LOCAL=1`. Nunca se activa por defecto ni en producción
 * (Next fija NODE_ENV=production en `next start`; el worker de producción no corre con NODE_ENV=test).
 * Cualquier otro host sigue pasando por `safeFetch` (anti-SSRF, docs/08 §6).
 */
export function allowLocalForTests(): boolean {
  return process.env.NODE_ENV === "test" && process.env.SEO_ALLOW_LOCAL === "1";
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
export const isLocalHost = (host: string) => LOCAL_HOSTS.has(host.toLowerCase());

export type FetchOpts = { method?: "GET" | "HEAD" | "POST"; headers?: Record<string, string>; body?: string; maxBytes?: number; timeoutMs?: number };
export type Fetcher = (url: string, opts?: FetchOpts) => Promise<SafeResponse>;

/** Un pedido sin seguir redirecciones (el crawler sigue y revalida cada salto). */
export const seoFetch: Fetcher = async (url, opts = {}) => {
  const u = new URL(url);
  if (allowLocalForTests() && u.protocol === "http:" && isLocalHost(u.hostname)) return localFetch(u, opts);
  return safeFetch(url, {
    method: opts.method,
    headers: opts.headers,
    body: opts.body,
    maxBytes: opts.maxBytes ?? 5 * 1024 * 1024,
    timeoutMs: opts.timeoutMs ?? 15_000,
    userAgent: SEO_USER_AGENT,
    followRedirects: false,
  });
};

/** Igual que seoFetch pero siguiendo redirecciones (máx. 5, cada salto revalidado). Para APIs de Google y enlaces externos. */
export async function seoFetchFollow(url: string, opts: FetchOpts = {}, max = 5): Promise<SafeResponse> {
  const redirects: string[] = [];
  let current = url;
  let method = opts.method ?? "GET";
  for (let i = 0; i <= max; i++) {
    const r = await seoFetch(current, { ...opts, method });
    if ([301, 302, 303, 307, 308].includes(r.status) && r.headers.location) {
      current = new URL(r.headers.location, current).toString();
      redirects.push(current);
      if (r.status === 303) method = "GET";
      continue;
    }
    return { ...r, url: current, redirects };
  }
  throw new Error("Demasiadas redirecciones");
}

function localFetch(url: URL, opts: FetchOpts): Promise<SafeResponse> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const req = httpRequest(
      {
        host: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || 80,
        path: `${url.pathname}${url.search}`,
        method: opts.method ?? "GET",
        headers: { "user-agent": SEO_USER_AGENT, accept: "*/*", ...opts.headers },
        timeout: opts.timeoutMs ?? 15_000,
      },
      (res) => {
        const ttfbMs = Date.now() - started;
        const chunks: Buffer[] = [];
        let size = 0;
        const max = opts.maxBytes ?? 5 * 1024 * 1024;
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
        const done = () => resolve({ url: url.toString(), status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks), redirects: [], ttfbMs });
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > max) {
            req.destroy();
            done();
            return;
          }
          chunks.push(c);
        });
        res.on("end", done);
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Tiempo de espera agotado")));
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}
