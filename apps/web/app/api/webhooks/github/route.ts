import { handleWebhook } from "@agencyos/modules/repos/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

/** Webhooks de la GitHub App: firma HMAC verificada en tiempo constante sobre el cuerpo crudo (docs/08). */
export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return new Response("Demasiado grande", { status: 413 });
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody) > MAX_BYTES) return new Response("Demasiado grande", { status: 413 });
  try {
    const r = await handleWebhook({
      event: req.headers.get("x-github-event"),
      deliveryId: req.headers.get("x-github-delivery"),
      signature: req.headers.get("x-hub-signature-256"),
      rawBody,
    });
    return new Response(r.body, { status: r.status, headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (e) {
    console.error("[webhook github]", e instanceof Error ? e.message : e);
    return new Response("Error interno", { status: 500 });
  }
}
