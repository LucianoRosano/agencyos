import { createHash } from "node:crypto";
import { rateLimited } from "@agencyos/core";
import { getPool } from "@agencyos/db";

/**
 * Rate limiting general (docs/SCALING.md §Rate limiting) — ventana deslizante aproximada en Postgres, compartida por
 * todas las instancias web (sin Redis).
 *
 * Algoritmo: dos ventanas fijas (`rate_limit_bucket`, clave + inicio de ventana). Estimado =
 * `anterior × (1 − transcurrido/ventana) + actual`; si supera `max`, se rechaza. Un solo UPSERT por pedido.
 * Los identificadores (IP, token, usuario) se guardan como hash: nunca un token en claro.
 * `RATE_LIMIT=off` o `AUTH_RATE_LIMIT=off` (e2e) lo desactivan; nunca en producción. Si la base falla, deja pasar
 * (fail-open). La purga de ventanas viejas la hace el worker (`purgeRateLimits`).
 * Es el ÚNICO mecanismo de la app: el login/2FA sigue con el de Better Auth (tabla `rate_limit`).
 *
 * Dos formas de uso (mismo motor):
 * - Rutas: `rateLimitResponse(regla, id)` → 429 con Retry-After, o `rateLimit(regla, id)`.
 * - Servicios/acciones: `hitRateLimit(clave, regla)` / `assertRateLimit(clave, regla)` (lanza DomainError RATE_LIMITED).
 */
export type RateRule = { name: string; max: number; windowSec: number };

export const RATE_RULES = {
  /** Abrir /p/[token] (y su PDF): por IP. */
  publicOpen: { name: "p.open", max: 60, windowSec: 60 },
  /** Aceptar / rechazar un presupuesto público: por IP. */
  publicDecide: { name: "p.decide", max: 10, windowSec: 15 * 60 },
  /** Webhooks entrantes (/api/webhooks/*): por endpoint + IP. */
  webhook: { name: "webhook", max: 120, windowSec: 60 },
  /** Servidor MCP: por token (o IP si no trae). */
  mcp: { name: "mcp", max: 300, windowSec: 60 },
  /** Descargas y miniaturas: por usuario. */
  fileDownload: { name: "files.get", max: 600, windowSec: 60 },
  /** Subidas (archivos y versiones): por usuario. */
  fileUpload: { name: "files.put", max: 120, windowSec: 60 },
  /** Portal de clientes (docs/08 §5): cualquier pantalla o descarga, por usuario. */
  portalRequest: { name: "portal.req", windowSec: 10 * 60, max: 600 },
  /** Escrituras del portal (aprobar, feedback, aceptar presupuesto), por usuario. */
  portalWrite: { name: "portal.write", windowSec: 10 * 60, max: 60 },
  /** Capturas del feedback, por usuario. */
  portalCapture: { name: "portal.capture", windowSec: 10 * 60, max: 30 },
  /** PDF de presupuesto en el portal (Chromium: caro), por usuario. */
  portalPdf: { name: "portal.pdf", windowSec: 10 * 60, max: 20 },
  /** Sincronización del modo sin conexión (copia y cola de cambios), por usuario. */
  sync: { name: "sync", windowSec: 60, max: 60 },
  /** Abrir una invitación, por IP. */
  invitationView: { name: "inv.view", windowSec: 15 * 60, max: 30 },
  /** Aceptar una invitación (crear cuenta), por IP. */
  invitationAccept: { name: "inv.accept", windowSec: 15 * 60, max: 10 },
} satisfies Record<string, RateRule>;

export type RateResult = { ok: boolean; limit: number; remaining: number; retryAfterSec: number; count?: number };

const hashId = (id: string) => createHash("sha256").update(id).digest("base64url").slice(0, 22);

export function rateLimitEnabled() {
  return process.env.RATE_LIMIT !== "off" && process.env.AUTH_RATE_LIMIT !== "off";
}

/** Registra un pedido y dice si está dentro del límite. */
export async function rateLimit(rule: RateRule, id: string, now = Date.now()): Promise<RateResult> {
  const pass: RateResult = { ok: true, limit: rule.max, remaining: rule.max, retryAfterSec: 0 };
  if (!rateLimitEnabled()) return pass;
  const w = rule.windowSec * 1000;
  const start = Math.floor(now / w) * w;
  const key = `${rule.name}:${hashId(id)}`;
  try {
    const { rows } = await getPool().query<{ curr: number; prev: number | null }>(
      `with up as (
         insert into rate_limit_bucket (key, window_start, count) values ($1, to_timestamp($2::double precision / 1000), 1)
         on conflict (key, window_start) do update set count = rate_limit_bucket.count + 1
         returning count
       )
       select (select count from up) as curr,
              (select count from rate_limit_bucket where key = $1 and window_start = to_timestamp($3::double precision / 1000)) as prev`,
      [key, start, start - w],
    );
    const curr = Number(rows[0]?.curr ?? 1);
    const prev = Number(rows[0]?.prev ?? 0);
    const elapsed = (now - start) / w;
    const estimate = prev * (1 - elapsed) + curr;
    const ok = estimate <= rule.max;
    // Si se pasó: esperar hasta que la ventana anterior "pese" lo suficiente menos (como mucho, el resto de la ventana).
    const retryAfterSec = ok ? 0 : Math.max(1, Math.ceil((start + w - now) / 1000));
    return { ok, limit: rule.max, remaining: Math.max(0, Math.floor(rule.max - estimate)), retryAfterSec, count: curr };
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "rate limit: falló la base, se deja pasar", rule: rule.name, err: String(e) }));
    return pass;
  }
}

/** IP del cliente detrás de Caddy (primer X-Forwarded-For; Caddy no confía en el que manda el cliente). */
export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export const RATE_LIMIT_MESSAGE = "Demasiados intentos seguidos. Esperá un momento y volvé a intentar.";

/** Respuesta 429 lista para Route Handlers, o `null` si está dentro del límite. */
export async function rateLimitResponse(rule: RateRule, id: string, opts: { json?: boolean } = {}): Promise<Response | null> {
  const r = await rateLimit(rule, id);
  if (r.ok) return null;
  const headers = {
    "Retry-After": String(r.retryAfterSec),
    "RateLimit-Limit": String(r.limit),
    "RateLimit-Remaining": "0",
    "Cache-Control": "no-store",
  };
  return opts.json
    ? Response.json({ ok: false, error: { code: "RATE_LIMITED", message: RATE_LIMIT_MESSAGE } }, { status: 429, headers })
    : new Response(RATE_LIMIT_MESSAGE, { status: 429, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
}

/** Borra ventanas de más de un día (job diario del worker). */
export async function purgeRateLimits(): Promise<number> {
  const r = await getPool().query("delete from rate_limit_bucket where window_start < now() - interval '1 day'");
  return r.rowCount ?? 0;
}

/** Forma "por clave" (servicios, acciones, páginas): la clave ya lleva la identidad (`portal:<userId>`, `inv:<ip>`). */
export async function hitRateLimit(key: string, rule: RateRule): Promise<{ ok: boolean; count: number; retryAfterSec: number }> {
  const r = await rateLimit(rule, key);
  return { ok: r.ok, count: r.count ?? 0, retryAfterSec: r.retryAfterSec };
}

/** Igual que hitRateLimit pero corta con un DomainError RATE_LIMITED (Result con ese código en las acciones). */
export async function assertRateLimit(key: string, rule: RateRule): Promise<void> {
  if (!(await hitRateLimit(key, rule)).ok) throw rateLimited(RATE_LIMIT_MESSAGE);
}
