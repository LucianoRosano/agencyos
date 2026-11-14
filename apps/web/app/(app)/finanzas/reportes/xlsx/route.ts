import { can } from "@agencyos/core";
import { buildXlsx } from "@agencyos/modules/shared/xlsx";
import { requireCtx } from "@/lib/session";
import { financeExport } from "../export";

export const dynamic = "force-dynamic";

/** Exportación Excel (.xlsx) autenticada (solo con permiso de finanzas). Mismos datos que el CSV, una hoja por tabla. */
export async function GET(req: Request) {
  const ctx = await requireCtx();
  if (!can(ctx, "read", "finance")) return new Response("No tenés permiso para exportar finanzas.", { status: 403 });
  const { baseName, sheets } = await financeExport(ctx, new URL(req.url).searchParams);
  const buf = await buildXlsx(sheets);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${baseName}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
