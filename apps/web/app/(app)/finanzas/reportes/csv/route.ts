import { can } from "@agencyos/core";
import { requireCtx } from "@/lib/session";
import { financeExport, toCsv } from "../export";

export const dynamic = "force-dynamic";

/** Exportación CSV autenticada (solo con permiso de finanzas). tipo = movimientos | mensual | rentabilidad */
export async function GET(req: Request) {
  const ctx = await requireCtx();
  if (!can(ctx, "read", "finance")) return new Response("No tenés permiso para exportar finanzas.", { status: 403 });
  const { baseName, sheets } = await financeExport(ctx, new URL(req.url).searchParams);
  return new Response(toCsv(sheets), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseName}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
