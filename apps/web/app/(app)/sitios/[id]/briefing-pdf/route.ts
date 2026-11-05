import { formatDate, L, label, todayAR } from "@agencyos/core";
import { answerText, briefBlocksFor } from "@agencyos/modules/sites/brief";
import { briefDocument } from "@agencyos/modules/sites/queries";
import { renderBriefPdf } from "@agencyos/pdf/brief";
import type { NextRequest } from "next/server";
import { requireCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PDF del briefing del sitio con la marca hacia el cliente (Luciano Rosano). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  if (!UUID.test(id)) return new Response("No encontrado", { status: 404 });
  const data = await briefDocument(ctx, id);
  if (!data) return new Response("No encontrado", { status: 404 });
  const { site, brief, brand } = data;
  const answers = (brief?.answers ?? {}) as Record<string, unknown>;
  const blocks = briefBlocksFor(site.s.kind).map((b) => ({
    title: b.title,
    rows: b.fields.map((f) => {
      const v = answerText(answers[f.key]);
      return { label: f.label, value: f.kind === "date" && v ? formatDate(v) : v || null };
    }),
  }));
  try {
    const pdf = await renderBriefPdf({
      brand,
      siteName: site.s.name,
      clientName: site.clientName,
      kindLabel: label(L.siteKind, site.s.kind),
      stackLabel: label(L.siteStack, site.s.stack),
      issueDate: todayAR(),
      version: brief?.version ?? 1,
      blocks,
      questions: brief?.questionsForClient ?? [],
    });
    const slug =
      site.s.name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "sitio";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${req.nextUrl.searchParams.get("ver") === "1" ? "inline" : "attachment"}; filename="Briefing-${slug}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[pdf] no se pudo generar el briefing", e);
    return new Response("No se pudo generar el PDF. Probá de nuevo en unos segundos.", { status: 500 });
  }
}
