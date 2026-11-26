import { notificationAction, unreadCount } from "@agencyos/modules/notifications/service";
import type { NextRequest } from "next/server";
import { apiCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** Botones de la notificación del sistema («Listo», «Más tarde»): los llama el service worker con la sesión. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await apiCtx();
  if (!ctx) return json({ error: "Sin sesión" }, 401);
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin && origin !== process.env.APP_URL) return json({ error: "Origen no permitido" }, 403);
  let action = "";
  try {
    action = String(((await req.json()) as { action?: unknown }).action ?? "");
  } catch {
    return json({ error: "Formato inválido" }, 400);
  }
  try {
    await notificationAction(ctx, (await params).id, action);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "No se pudo" }, 400);
  }
  return json({ ok: true, unread: await unreadCount(ctx) });
}
