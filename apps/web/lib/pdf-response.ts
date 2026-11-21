import "server-only";
import type { NextRequest } from "next/server";

/** Respuesta PDF: se abre en el navegador (o se descarga con `?descargar=1`); si Chromium falla, error claro. */
export async function pdfResponse(req: NextRequest, make: () => Promise<Buffer>, name: string) {
  try {
    const pdf = await make();
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${req.nextUrl.searchParams.get("descargar") === "1" ? "attachment" : "inline"}; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[pdf] no se pudo generar", e);
    return new Response("No se pudo generar el PDF. Probá de nuevo en unos segundos.", { status: 500 });
  }
}
