import { getDb, schema } from "@agencyos/db";
import { assertRateLimit, hitRateLimit } from "@agencyos/modules/shared/rate-limit";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

describe("rate limit propio (portal e invitaciones)", () => {
  it("cuenta por clave dentro de la ventana y corta al pasar el máximo", async () => {
    const key = `test:${Math.random().toString(36).slice(2)}`;
    const rule = { windowSec: 60, max: 3 };
    for (let i = 1; i <= 3; i++) expect((await hitRateLimit(key, rule)).ok).toBe(true);
    const r = await hitRateLimit(key, rule);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
    await expect(assertRateLimit(key, rule)).rejects.toThrow(/Demasiados intentos/);
    // otra clave no se ve afectada
    expect((await hitRateLimit(`${key}:otra`, rule)).ok).toBe(true);
  });

  it("la ventana vencida reinicia el contador; usa la tabla rate_limit con prefijo app:", async () => {
    const key = `test:${Math.random().toString(36).slice(2)}`;
    const rule = { windowSec: 60, max: 1 };
    expect((await hitRateLimit(key, rule)).ok).toBe(true);
    expect((await hitRateLimit(key, rule)).ok).toBe(false);
    await getDb()
      .update(schema.rateLimit)
      .set({ lastRequest: Date.now() - 61_000 })
      .where(eq(schema.rateLimit.key, `app:${key}`));
    expect((await hitRateLimit(key, rule)).ok).toBe(true);
  });

  it("concurrencia: el upsert es atómico (no se pierden conteos)", async () => {
    const key = `test:${Math.random().toString(36).slice(2)}`;
    const rule = { windowSec: 60, max: 5 };
    const rs = await Promise.all(Array.from({ length: 10 }, () => hitRateLimit(key, rule)));
    expect(rs.filter((r) => r.ok)).toHaveLength(5);
  });
});
