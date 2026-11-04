import { geistFontBuffer } from "@agencyos/pdf/fonts";

export const runtime = "nodejs";

/** Geist para la vista previa del presupuesto (iframe aislado): se sirve igual que en el PDF. */
export function GET() {
  const buf = geistFontBuffer();
  if (!buf) return new Response("Fuente no disponible", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "font/woff2",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
