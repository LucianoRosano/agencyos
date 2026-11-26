import { latestUnread, unreadCount } from "@agencyos/modules/notifications/service";
import { apiCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Para el aviso en vivo con la app abierta: cuántos sin leer y el último. */
export async function GET() {
  const ctx = await apiCtx();
  if (!ctx) return new Response(JSON.stringify({ error: "Sin sesión" }), { status: 401, headers: { "Content-Type": "application/json" } });
  const [unread, latest] = await Promise.all([unreadCount(ctx), latestUnread(ctx)]);
  return new Response(
    JSON.stringify({
      unread,
      latest: latest ? { id: latest.id, title: latest.title, body: latest.body, priority: latest.priority, href: `/notificaciones/abrir/${latest.id}` } : null,
    }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } },
  );
}
