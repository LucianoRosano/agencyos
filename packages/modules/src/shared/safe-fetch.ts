import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

/**
 * Fetch con protección anti-SSRF (docs/08 §6). Obligatorio para crawler, monitoreo, webhooks salientes y lectura de URLs.
 * - Solo http/https, puertos 80/443 (443/80 por defecto).
 * - Resuelve DNS ANTES de conectar y bloquea rangos privados, loopback, link-local, CGNAT, multicast y metadata (IPv4/IPv6).
 * - Conecta a la IP ya validada (anti DNS rebinding) conservando Host/SNI.
 * - Máximo 5 redirecciones, revalidando cada destino. Límite de tamaño y timeout.
 */
export type SafeResponse = {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  redirects: string[];
  ttfbMs: number;
  tls?: { validTo?: string; issuer?: string };
};

export class SsrfError extends Error {}

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isBlockedIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => (n & (bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0)) === (ipv4ToInt(base) & ((~0 << (32 - bits)) >>> 0)));
  }
  if (isIP(ip) === 6) {
    const s = ip.toLowerCase();
    if (s === "::" || s === "::1") return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isBlockedIp(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s) || s.startsWith("64:ff9b:") || s.startsWith("2001:db8");
  }
  return true;
}

export async function assertPublicUrl(raw: string): Promise<{ url: URL; ip: string; family: 4 | 6 }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("URL inválida");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new SsrfError("Solo se permiten http y https");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443) throw new SsrfError("Solo se permiten los puertos 80 y 443");
  if (url.username || url.password) throw new SsrfError("No se permiten credenciales en la URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw new SsrfError("Host no permitido");
  const addrs = isIP(host) ? [{ address: host, family: isIP(host) as 4 | 6 }] : await lookup(host, { all: true, verbatim: true });
  if (!addrs.length) throw new SsrfError("El dominio no resuelve");
  for (const a of addrs) if (isBlockedIp(a.address)) throw new SsrfError("El destino resuelve a una red privada o reservada");
  const first = addrs[0] as { address: string; family: number };
  return { url, ip: first.address, family: first.family === 6 ? 6 : 4 };
}

export async function safeFetch(
  raw: string,
  opts: {
    method?: "GET" | "HEAD" | "POST";
    headers?: Record<string, string>;
    body?: string | Buffer;
    maxBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
    userAgent?: string;
    /** false: devuelve la respuesta 3xx tal cual (el llamador sigue y revalida cada salto). Por defecto true. */
    followRedirects?: boolean;
  } = {},
): Promise<SafeResponse> {
  const maxRedirects = opts.maxRedirects ?? 5;
  const redirects: string[] = [];
  let current = raw;
  let method = opts.method ?? "GET";
  for (let i = 0; i <= maxRedirects; i++) {
    const { url, ip, family } = await assertPublicUrl(current);
    const res = await once(url, ip, family, { ...opts, method });
    if (opts.followRedirects === false) return { ...res, url: current, redirects };
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
      const next = new URL(res.headers.location, url).toString();
      redirects.push(next);
      current = next;
      if (res.status === 303) method = "GET";
      continue;
    }
    return { ...res, url: current, redirects };
  }
  throw new SsrfError("Demasiadas redirecciones");
}

function once(
  url: URL,
  ip: string,
  family: 4 | 6,
  opts: { method: string; headers?: Record<string, string>; body?: string | Buffer; maxBytes?: number; timeoutMs?: number; userAgent?: string },
) {
  return new Promise<Omit<SafeResponse, "url" | "redirects">>((resolve, reject) => {
    const started = Date.now();
    const isHttps = url.protocol === "https:";
    const req = (isHttps ? httpsRequest : httpRequest)(
      {
        host: ip,
        family,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: opts.method,
        servername: isHttps && !isIP(url.hostname) ? url.hostname : undefined,
        headers: { host: url.host, "user-agent": opts.userAgent ?? "AGENCYOS/1.0 (+https://agencyos)", accept: "*/*", ...opts.headers },
        timeout: opts.timeoutMs ?? 15_000,
      },
      (res) => {
        const ttfbMs = Date.now() - started;
        const chunks: Buffer[] = [];
        let size = 0;
        const max = opts.maxBytes ?? 5 * 1024 * 1024;
        const sock = res.socket as unknown as { getPeerCertificate?: () => { valid_to?: string; issuer?: { O?: string; CN?: string } } };
        const cert = isHttps ? sock.getPeerCertificate?.() : undefined;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > max) {
            req.destroy();
            resolve({ status: res.statusCode ?? 0, headers: flat(res.headers), body: Buffer.concat(chunks), ttfbMs, tls: tlsInfo(cert) });
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: flat(res.headers), body: Buffer.concat(chunks), ttfbMs, tls: tlsInfo(cert) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Tiempo de espera agotado")));
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function flat(h: Record<string, string | string[] | undefined>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) if (v !== undefined) o[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
  return o;
}

function tlsInfo(cert?: { valid_to?: string; issuer?: { O?: string; CN?: string } }) {
  if (!cert || !cert.valid_to) return undefined;
  return { validTo: cert.valid_to, issuer: cert.issuer?.O ?? cert.issuer?.CN };
}
