import { timingSafeEqual } from "node:crypto";
import { prometheusMetrics } from "@agencyos/modules/shared/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Métricas Prometheus (docs/OBSERVABILITY.md). Protegidas con `Authorization: Bearer $METRICS_TOKEN` (mín. 16 caracteres).
 * Sin METRICS_TOKEN configurado la ruta no existe (404).
 */
export async function GET(req: Request) {
  const token = process.env.METRICS_TOKEN;
  if (!token || token.length < 16) return new Response("No encontrado", { status: 404 });
  const auth = req.headers.get("authorization") ?? "";
  const given = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!same(given, token)) return new Response("No autorizado", { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="metrics"' } });
  return new Response(await prometheusMetrics(), {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" },
  });
}
