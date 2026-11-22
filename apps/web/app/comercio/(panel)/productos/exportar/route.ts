import { listProducts } from "@agencyos/modules/shop/service";
import { requireShopCtx } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (v: string | number | null | undefined) => {
  const s = String(v ?? "");
  // Evita fórmulas al abrirlo en Excel (inyección CSV) y escapa comillas y separadores.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const num = (v: string | null) => (v === null ? "" : v.replace(".", ","));

/** Productos activos en CSV (separador «;», precios con coma): el mismo formato que acepta la importación. */
export async function GET() {
  const sc = await requireShopCtx();
  if (sc.role === "seller") return new Response("Solo el dueño o un administrador", { status: 403 });
  const rows = await listProducts(sc, { limit: 20_000 });
  const lines = [
    "Nombre;Código;Código de barras;Categoría;Precio;Costo;Stock;Stock mínimo",
    ...rows.map((p) => [p.name, p.sku, p.barcode, p.category, num(p.price), num(p.cost), p.stock, p.minStock].map(cell).join(";")),
  ];
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="productos-${sc.shopName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
