import { can, todayAR } from "@agencyos/core";
import { clientReportDoc, defaultReportMonth } from "@agencyos/modules/crm/report";
import { renderClientReportPdf } from "@agencyos/pdf/client-report";
import type { NextRequest } from "next/server";
import { requireCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Informe mensual del cliente en PDF (trabajo hecho, horas, abonos y sitios) con la marca. ?anio=&mes= (default: mes anterior). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "read", "crm")) return new Response("No tenés permiso para ver este cliente.", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Cliente inválido.", { status: 400 });
  const p = req.nextUrl.searchParams;
  const def = defaultReportMonth();
  const thisYear = Number(todayAR().slice(0, 4));
  const y = Number(p.get("anio"));
  const m = Number(p.get("mes"));
  const year = y >= 2020 && y <= thisYear ? y : def.year;
  const month = m >= 1 && m <= 12 ? m : def.month;
  try {
    const doc = await clientReportDoc(ctx, id, year, month);
    const pdf = await renderClientReportPdf(doc);
    const slug = doc.clientName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${p.get("ver") === "1" ? "inline" : "attachment"}; filename="informe-${slug}-${year}-${String(month).padStart(2, "0")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof Error && /no existe|not found|El cliente/i.test(e.message)) return new Response("Cliente no encontrado.", { status: 404 });
    console.error("[pdf informe cliente] no se pudo generar", e);
    return new Response("No se pudo generar el PDF. Probá de nuevo en unos segundos.", { status: 500 });
  }
}
