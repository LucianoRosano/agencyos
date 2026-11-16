import { healthReport } from "@agencyos/modules/shared/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Salud (docs/OBSERVABILITY.md). Sin datos sensibles.
 * - `?live=1`: liveness (proceso vivo; lo usan Docker, Caddy y Playwright).
 * - sin parámetros: readiness con chequeos (base, latido del worker, outbox, espacio del almacenamiento local).
 *   200 = ok o "degraded" (avisos); 503 = la base no responde.
 */
export async function GET(req: Request) {
  const version = process.env.APP_VERSION ?? "dev";
  if (new URL(req.url).searchParams.has("live")) return Response.json({ ok: true, version });
  const h = await healthReport();
  return Response.json(
    { ok: h.status !== "fail", status: h.status, version, db: h.checks.db.status === "ok" ? "ok" : "error", checks: h.checks },
    { status: h.status === "fail" ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
