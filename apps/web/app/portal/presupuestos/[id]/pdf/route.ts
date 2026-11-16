import { portalQuoteDocument } from "@agencyos/modules/portal/service";
import { hitRateLimit, RATE_RULES } from "@agencyos/modules/shared/rate-limit";
import { renderQuotePdf } from "@agencyos/pdf";
import { requirePortalCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PDF del presupuesto para el cliente del portal (solo los suyos y enviados). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const pc = await requirePortalCtx();
  const rl = await hitRateLimit(`portal:pdf:${pc.userId}`, RATE_RULES.portalPdf);
  if (!rl.ok)
    return new Response("Demasiados pedidos. Esperá unos minutos.", {
      status: 429,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(rl.retryAfterSec) },
    });
  const { id } = await params;
  const doc = pc.clientId ? await portalQuoteDocument(pc, id) : null;
  if (!doc) return new Response("No encontrado", { status: 404 });
  const pdf = await renderQuotePdf(doc);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${doc.number}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
