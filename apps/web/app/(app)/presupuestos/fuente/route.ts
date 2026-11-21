import { docFontBuffer } from "@agencyos/pdf/fonts";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

/** Fuentes de la vista previa del presupuesto (iframe aislado): las mismas que el PDF. `?f=sans` o `?f=serif`. */
export function GET(req: NextRequest) {
  const buf = docFontBuffer(req.nextUrl.searchParams.get("f") === "serif" ? "serif" : "sans");
  if (!buf) return new Response("Fuente no disponible", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "font/woff2",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
