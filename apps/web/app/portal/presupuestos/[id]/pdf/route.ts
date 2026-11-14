import { portalQuoteDocument } from "@agencyos/modules/portal/service";
import { renderQuotePdf } from "@agencyos/pdf";
import { requirePortalCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PDF del presupuesto para el cliente del portal (solo los suyos y enviados). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const pc = await requirePortalCtx();
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
