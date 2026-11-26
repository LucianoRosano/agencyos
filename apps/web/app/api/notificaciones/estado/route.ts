import { latestUnread, listNotifications, unreadCount } from "@agencyos/modules/notifications/service";
import type { NextRequest } from "next/server";
import { apiCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Para el aviso en vivo con la app abierta: cuántos sin leer y el último (con `?lista=1`, los primeros 8 sin leer). */
export async function GET(req: NextRequest) {
  const ctx = await apiCtx();
  if (!ctx) return new Response(JSON.stringify({ error: "Sin sesión" }), { status: 401, headers: { "Content-Type": "application/json" } });
  const withList = req.nextUrl.searchParams.get("lista") === "1";
  const [unread, latest, list] = await Promise.all([unreadCount(ctx), latestUnread(ctx), withList ? listNotifications(ctx, "sin-leer", 8) : []]);
  return new Response(
    JSON.stringify({
      unread,
      latest: latest ? { id: latest.id, title: latest.title, body: latest.body, priority: latest.priority, href: `/notificaciones/abrir/${latest.id}` } : null,
      items: list.map((n) => ({ id: n.id, type: n.type, title: n.title, priority: n.priority, createdAt: n.createdAt, href: `/notificaciones/abrir/${n.id}` })),
    }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } },
  );
}
