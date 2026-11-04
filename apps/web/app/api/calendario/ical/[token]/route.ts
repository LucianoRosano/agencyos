import { icalFeed } from "@agencyos/modules/calendar/service";

export const dynamic = "force-dynamic";

/**
 * Feed iCal de solo lectura (M12b). Sin sesión: el token de la URL es la credencial
 * (se valida contra su SHA-256 con comparación en tiempo constante). Revocable desde /calendario.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw).replace(/\.ics$/i, "");
  const base = process.env.APP_URL ?? new URL(request.url).origin;
  const body = await icalFeed(token, { baseUrl: base });
  if (!body) {
    return new Response("Suscripción inválida o revocada.\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="agencyos.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
