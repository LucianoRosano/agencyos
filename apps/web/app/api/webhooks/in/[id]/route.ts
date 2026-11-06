import { SIGNATURE_HEADER } from "@agencyos/modules/automations/engine";
import { receiveWebhook } from "@agencyos/modules/automations/service";

export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

/** Lee el cuerpo como texto sin pasar del límite (aunque no venga Content-Length). */
async function readCapped(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Webhook entrante de automatizaciones (docs/08 §5). Sin sesión: la credencial es la firma
 * `X-Agencyos-Signature: t=<unix>,v1=<hex(HMAC-SHA256(secreto, "<t>.<cuerpo>"))>` con ventana de 5 minutos.
 * Firma repetida → 409 (anti-replay). Los mensajes de error son genéricos (sin detalles internos).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readCapped(req);
  if (body === null) return Response.json({ ok: false, error: "Cuerpo demasiado grande" }, { status: 413, headers });
  const r = await receiveWebhook(id, body, req.headers.get(SIGNATURE_HEADER));
  return Response.json(r.status === 202 ? { ok: true, eventId: r.eventId } : { ok: false, error: r.message }, { status: r.status, headers });
}

export function GET() {
  return Response.json({ ok: false, error: "Usá POST" }, { status: 405, headers: { ...headers, Allow: "POST" } });
}
