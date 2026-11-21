import { applyMutations, pullSnapshot } from "@agencyos/modules/offline/service";
import { hitRateLimit, RATE_RULES } from "@agencyos/modules/shared/rate-limit";
import type { NextRequest } from "next/server";
import { apiCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", ...extra } });

async function guard() {
  const ctx = await apiCtx();
  if (!ctx) return { error: json({ error: "Iniciá sesión para sincronizar." }, 401) };
  const rl = await hitRateLimit(`sync:${ctx.userId}`, RATE_RULES.sync);
  if (!rl.ok) return { error: json({ error: "Demasiadas sincronizaciones seguidas." }, 429, { "Retry-After": String(rl.retryAfterSec) }) };
  return { ctx };
}

/** Copia para usar sin conexión: completa, o lo cambiado desde `?desde=<serverTime anterior>`. */
export async function GET(req: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;
  const snap = await pullSnapshot(g.ctx, { since: req.nextUrl.searchParams.get("desde") });
  return json({ ...snap, user: { id: g.ctx.userId, workspaceId: g.ctx.workspaceId, name: g.ctx.user.name } });
}

/** Cola de cambios hechos sin conexión: { mutations: [...] } → un resultado por cambio. */
export async function POST(req: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;
  // Solo desde la propia app (además del preflight CORS que exige el JSON): defensa contra CSRF.
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin && origin !== process.env.APP_URL) return json({ error: "Origen no permitido" }, 403);
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return json({ error: "Formato inválido" }, 415);
  const text = await req.text();
  if (text.length > 4_000_000) return json({ error: "Demasiados cambios juntos" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Formato inválido" }, 400);
  }
  try {
    return json({ results: await applyMutations(g.ctx, body) });
  } catch (e) {
    if (e && typeof e === "object" && "issues" in e) return json({ error: "Cambios inválidos" }, 400);
    throw e;
  }
}
