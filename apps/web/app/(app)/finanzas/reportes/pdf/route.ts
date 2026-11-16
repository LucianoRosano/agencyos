import { can, todayAR } from "@agencyos/core";
import { financeReportDoc } from "@agencyos/modules/finance/queries";
import { renderFinanceReportPdf } from "@agencyos/pdf/finance-report";
import type { NextRequest } from "next/server";
import { requireCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Informe PDF de Finanzas (resumen mensual, categorías y rentabilidad) con la marca. Solo con permiso de finanzas. */
export async function GET(req: NextRequest) {
  const ctx = await requireCtx();
  if (!can(ctx, "read", "finance")) return new Response("No tenés permiso para ver los reportes de finanzas.", { status: 403 });
  const p = req.nextUrl.searchParams;
  const thisYear = Number(todayAR().slice(0, 4));
  const y = Number(p.get("anio"));
  const year = y >= 2000 && y <= thisYear + 1 ? y : thisYear;
  const m = Number(p.get("mes"));
  const month = m >= 1 && m <= 12 ? m : null;
  const currency = p.get("moneda") === "USD" ? "USD" : "ARS";
  const doc = await financeReportDoc(ctx, { year, month, currency, ledgerId: p.get("libro") ?? undefined });
  try {
    const pdf = await renderFinanceReportPdf(doc);
    const name = `informe-finanzas-${year}${month ? `-${String(month).padStart(2, "0")}` : ""}-${currency}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${p.get("ver") === "1" ? "inline" : "attachment"}; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[pdf finanzas] no se pudo generar", e);
    return new Response("No se pudo generar el PDF. Probá de nuevo en unos segundos.", { status: 500 });
  }
}
