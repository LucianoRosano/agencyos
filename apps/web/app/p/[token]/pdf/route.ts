import { publicQuoteDocument } from "@agencyos/modules/quotes/public";
import { renderQuotePdf } from "@agencyos/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await publicQuoteDocument(token);
  if (!doc) return new Response("El enlace venció o no es válido", { status: 404 });
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
