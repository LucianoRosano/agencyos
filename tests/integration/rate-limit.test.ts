import { randomUUID } from "node:crypto";
import { getPool } from "@agencyos/db";
import { clientIp, purgeRateLimits, type RateRule, rateLimit, rateLimitResponse } from "@agencyos/modules/shared/rate-limit";
import { describe, expect, it } from "vitest";

const rule = (max: number, windowSec = 60): RateRule => ({ name: `test.${randomUUID()}`, max, windowSec });

describe("rate limit (ventana deslizante en Postgres)", () => {
  it("deja pasar hasta el máximo y rechaza el siguiente, por clave", async () => {
    const r = rule(3);
    const t = Date.UTC(2026, 0, 1, 12, 0, 1); // 1 s después del inicio de la ventana
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(r, "1.2.3.4", t));
    expect(results.map((x) => x.ok)).toEqual([true, true, true, false]);
    expect(results[3]?.retryAfterSec).toBeGreaterThan(0);
    // otra IP no se ve afectada
    expect((await rateLimit(r, "5.6.7.8", t)).ok).toBe(true);
  });

  it("la ventana anterior pesa proporcionalmente (deslizante, no se resetea de golpe)", async () => {
    const r = rule(10, 60);
    const w0 = Date.UTC(2026, 0, 1, 12, 0, 0);
    for (let i = 0; i < 10; i++) await rateLimit(r, "ip", w0 + 30_000);
    // Comienzo de la ventana siguiente: la anterior pesa ~100 % → rechaza.
    expect((await rateLimit(r, "ip", w0 + 60_000 + 1_000)).ok).toBe(false);
    // Al 90 % de la ventana siguiente: 10 × 0,1 + 2 = 3 → pasa.
    expect((await rateLimit(r, "ip", w0 + 60_000 + 54_000)).ok).toBe(true);
  });

  it("guarda el identificador hasheado (nunca el token en claro) y la purga borra ventanas viejas", async () => {
    const r = rule(5);
    const secret = `ag_${randomUUID()}`;
    await rateLimit(r, secret, Date.now() - 3 * 86_400_000);
    const { rows } = await getPool().query<{ key: string }>("select key from rate_limit_bucket where key like $1", [`${r.name}:%`]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key.includes(secret)).toBe(false);
    expect(await purgeRateLimits()).toBeGreaterThanOrEqual(1);
    const after = await getPool().query("select 1 from rate_limit_bucket where key like $1", [`${r.name}:%`]);
    expect(after.rowCount).toBe(0);
  });

  it("rateLimitResponse devuelve 429 con Retry-After; RATE_LIMIT=off lo desactiva", async () => {
    const r = rule(1);
    expect(await rateLimitResponse(r, "x")).toBeNull();
    const res = await rateLimitResponse(r, "x", { json: true });
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await res?.json()) as { error?: { code: string } } | undefined)?.error?.code).toBe("RATE_LIMITED");
    process.env.RATE_LIMIT = "off";
    try {
      expect(await rateLimitResponse(r, "x")).toBeNull();
    } finally {
      delete process.env.RATE_LIMIT;
    }
  });

  it("toma la IP del primer X-Forwarded-For (Caddy)", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "200.1.1.1, 10.0.0.2" }))).toBe("200.1.1.1");
    expect(clientIp(new Headers())).toBe("local");
  });
});
