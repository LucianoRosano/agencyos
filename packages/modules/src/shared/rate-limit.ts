import { randomUUID } from "node:crypto";
import { rateLimited } from "@agencyos/core";
import { getDb } from "@agencyos/db";
import { sql } from "drizzle-orm";

/**
 * Rate limit propio para rutas fuera de Better Auth (portal, invitaciones, descargas, PDF).
 * Usa la misma tabla `rate_limit` que Better Auth, con claves prefijadas `app:` para no chocar:
 * ventana fija por clave (count + inicio de la ventana en `last_request`, ms), con un upsert atómico.
 * Se desactiva con AUTH_RATE_LIMIT=off (e2e), igual que el de Better Auth.
 */

export type RateRule = { windowSec: number; max: number };

/** Reglas de la app (docs/08 §5). Las claves llevan además el usuario, la IP o el token. */
export const RATE_RULES = {
  /** Cualquier pantalla o descarga del portal, por usuario. */
  portalRequest: { windowSec: 10 * 60, max: 600 },
  /** Escrituras del portal (aprobar, feedback, aceptar presupuesto), por usuario. */
  portalWrite: { windowSec: 10 * 60, max: 60 },
  /** Capturas del feedback, por usuario. */
  portalCapture: { windowSec: 10 * 60, max: 30 },
  /** PDF de presupuesto (Chromium: caro), por usuario. */
  portalPdf: { windowSec: 10 * 60, max: 20 },
  /** Abrir una invitación, por IP. */
  invitationView: { windowSec: 15 * 60, max: 30 },
  /** Aceptar una invitación (crear cuenta), por IP. */
  invitationAccept: { windowSec: 15 * 60, max: 10 },
} satisfies Record<string, RateRule>;

export const rateLimitEnabled = () => process.env.AUTH_RATE_LIMIT !== "off";

/** Registra un intento y dice si está dentro del límite. */
export async function hitRateLimit(key: string, rule: RateRule): Promise<{ ok: boolean; count: number; retryAfterSec: number }> {
  if (!rateLimitEnabled()) return { ok: true, count: 0, retryAfterSec: 0 };
  const now = Date.now();
  const windowMs = rule.windowSec * 1000;
  const k = `app:${key}`.slice(0, 300);
  const r = await getDb().execute<{ count: number; last_request: string }>(sql`
    insert into rate_limit (id, key, count, last_request) values (${randomUUID()}, ${k}, 1, ${now})
    on conflict (key) do update set
      count = case when rate_limit.last_request <= ${now - windowMs} then 1 else rate_limit.count + 1 end,
      last_request = case when rate_limit.last_request <= ${now - windowMs} then ${now} else rate_limit.last_request end
    returning count, last_request`);
  const row = r.rows[0];
  const count = Number(row?.count ?? 1);
  const start = Number(row?.last_request ?? now);
  return { ok: count <= rule.max, count, retryAfterSec: Math.max(1, Math.ceil((start + windowMs - now) / 1000)) };
}

/** Igual que hitRateLimit pero corta con un DomainError RATE_LIMITED. */
export async function assertRateLimit(key: string, rule: RateRule): Promise<void> {
  const r = await hitRateLimit(key, rule);
  if (!r.ok) throw rateLimited();
}
