import { issuesCsv } from "@agencyos/modules/seo/queries";
import { requireCtx } from "@/lib/session";

export const dynamic = "force-dynamic";

/** CSV de problemas de una auditoría (fórmulas neutralizadas, `;`, UTF-8 con BOM). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const r = await issuesCsv(ctx, (await params).id);
  if (!r) return new Response("No encontrado", { status: 404 });
  return new Response(r.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${r.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
