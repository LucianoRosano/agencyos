import { cmpMoney, formatMoney, validation } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { eq } from "drizzle-orm";
import { columnIndex, parseAmount, parseCsv } from "../import/csv";
import { assertRole, productInput, type ShopCtx, touch } from "./service";

/**
 * Importar productos del comercio desde un CSV (Excel, Sheets o el sistema anterior). Dos pasos: vista previa y aplicar
 * (vuelve a validar todo). Si el producto ya existe (mismo código, código de barras o nombre) se actualizan el precio y
 * el costo: sirve para subir la lista de precios nueva sin tocar el stock. Nada se borra.
 */
const MAX_ROWS = 3000;
const MAX_BYTES = 2 * 1024 * 1024;

const COLS = {
  name: ["nombre", "producto", "descripcion", "articulo", "name"],
  sku: ["codigo", "sku", "cod", "codigo interno", "id"],
  barcode: ["codigo de barras", "ean", "barcode", "cod barras", "codigo barras"],
  category: ["categoria", "rubro", "familia", "category"],
  price: ["precio", "precio de venta", "precio venta", "pvp", "price"],
  cost: ["costo", "precio de costo", "costo unitario", "cost"],
  stock: ["stock", "cantidad", "existencia", "stock actual"],
  minStock: ["stock minimo", "minimo", "min stock"],
} as const;

export const PRODUCT_TEMPLATE = "Nombre;Código;Código de barras;Categoría;Precio;Costo;Stock;Stock mínimo";

export type ProductImportRow = { line: number; status: "ok" | "update" | "same" | "error"; summary: string; message?: string };
export type ProductImportPreview = { rows: ProductImportRow[]; create: number; update: number; same: number; errors: number };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

type Plan = { kind: "create"; data: ReturnType<typeof productInput.parse> } | { kind: "update"; id: string; price: string; cost: string | null } | null;

async function plan(sc: ShopCtx, csv: string) {
  if (!csv || csv.length > MAX_BYTES) throw validation("El archivo está vacío o supera 2 MB.");
  const [headers, ...body] = parseCsv(csv);
  if (!headers || !body.length) throw validation("El archivo necesita una fila de encabezados y al menos un producto.");
  if (body.length > MAX_ROWS) throw validation(`Máximo ${MAX_ROWS} productos por importación (este tiene ${body.length}).`);
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, a]) => [k, columnIndex(headers, [...a])])) as Record<keyof typeof COLS, number>;
  if (idx.name < 0) throw validation("Falta la columna «Nombre» (o «Producto»).");
  if (idx.price < 0) throw validation("Falta la columna «Precio».");

  const existing = await getDb()
    .select({
      id: schema.shopProduct.id,
      name: schema.shopProduct.name,
      sku: schema.shopProduct.sku,
      barcode: schema.shopProduct.barcode,
      price: schema.shopProduct.price,
      cost: schema.shopProduct.cost,
    })
    .from(schema.shopProduct)
    .where(eq(schema.shopProduct.shopId, sc.shopId));
  const bySku = new Map(existing.filter((p) => p.sku).map((p) => [norm(p.sku ?? ""), p]));
  const byBarcode = new Map(existing.filter((p) => p.barcode).map((p) => [p.barcode ?? "", p]));
  const byName = new Map(existing.map((p) => [norm(p.name), p]));
  const seen = new Set<string>();
  const out: { row: ProductImportRow; plan: Plan }[] = [];
  const money = (v: string) => formatMoney(v, sc.currency);

  for (const [i, cells] of body.entries()) {
    const line = i + 2;
    const get = (k: keyof typeof COLS) => (idx[k] >= 0 ? cells[idx[k]]?.trim() || undefined : undefined);
    const name = get("name");
    const err = (message: string) => out.push({ row: { line, status: "error", summary: name ?? "(sin nombre)", message }, plan: null });
    if (!name) {
      err("Falta el nombre");
      continue;
    }
    const priceRaw = get("price");
    const price = priceRaw ? parseAmount(priceRaw) : null;
    if (!price || price.negative) {
      err(`Precio inválido «${priceRaw ?? ""}»`);
      continue;
    }
    const costRaw = get("cost");
    const cost = costRaw ? parseAmount(costRaw) : null;
    if (costRaw && (!cost || cost.negative)) {
      err(`Costo inválido «${costRaw}»`);
      continue;
    }
    const sku = get("sku");
    const barcode = get("barcode");
    const key = sku ? `s:${norm(sku)}` : barcode ? `b:${barcode}` : `n:${norm(name)}`;
    if (seen.has(key)) {
      err("Repetido en el archivo");
      continue;
    }
    seen.add(key);

    const match = (sku && bySku.get(norm(sku))) || (barcode && byBarcode.get(barcode)) || byName.get(norm(name));
    if (match) {
      const newCost = cost ? cost.value : match.cost;
      const samePrice = cmpMoney(match.price, price.value) === 0;
      const sameCost = (match.cost ?? null) === (newCost ?? null) || (match.cost !== null && newCost !== null && cmpMoney(match.cost, newCost) === 0);
      if (samePrice && sameCost) {
        out.push({ row: { line, status: "same", summary: match.name, message: "Sin cambios" }, plan: null });
        continue;
      }
      const changes = [
        samePrice ? null : `precio ${money(match.price)} → ${money(price.value)}`,
        sameCost || !newCost ? null : `costo ${match.cost ? money(match.cost) : "—"} → ${money(newCost)}`,
      ].filter(Boolean);
      out.push({
        row: { line, status: "update", summary: match.name, message: changes.join(" · ") },
        plan: { kind: "update", id: match.id, price: price.value, cost: newCost ?? null },
      });
      continue;
    }
    const intOf = (k: "stock" | "minStock") => {
      const v = get(k);
      return v ? Number(v.replace(/\./g, "").replace(",", ".")) : 0;
    };
    const parsed = productInput.safeParse({
      name,
      sku,
      barcode,
      category: get("category"),
      price: price.value,
      cost: cost?.value,
      stock: intOf("stock"),
      minStock: intOf("minStock"),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      err(`${String(issue?.path[0] ?? "")}: ${issue?.message ?? "dato inválido"}`);
      continue;
    }
    const d = parsed.data;
    out.push({
      row: { line, status: "ok", summary: name, message: [money(d.price), d.stock ? `stock ${d.stock}` : null, d.category].filter(Boolean).join(" · ") },
      plan: { kind: "create", data: d },
    });
  }
  return out;
}

function summarize(rows: ProductImportRow[]): ProductImportPreview {
  return {
    rows,
    create: rows.filter((r) => r.status === "ok").length,
    update: rows.filter((r) => r.status === "update").length,
    same: rows.filter((r) => r.status === "same").length,
    errors: rows.filter((r) => r.status === "error").length,
  };
}

export async function previewProductImport(sc: ShopCtx, csv: string): Promise<ProductImportPreview> {
  assertRole(sc, ["owner", "admin"], "Importar productos");
  return summarize((await plan(sc, csv)).map((p) => p.row));
}

/** Crea los nuevos y actualiza precio/costo de los existentes, todo en una transacción. */
export async function applyProductImport(sc: ShopCtx, csv: string) {
  assertRole(sc, ["owner", "admin"], "Importar productos");
  const items = await plan(sc, csv);
  await getDb().transaction(async (t) => {
    for (const it of items) {
      const p = it.plan;
      if (!p) continue;
      if (p.kind === "update") {
        await t.update(schema.shopProduct).set({ price: p.price, cost: p.cost }).where(eq(schema.shopProduct.id, p.id));
        continue;
      }
      const d = p.data;
      const [row] = await t
        .insert(schema.shopProduct)
        .values({
          shopId: sc.shopId,
          createdBy: sc.userId,
          ...d,
          cost: d.cost ?? null,
          sku: d.sku ?? null,
          barcode: d.barcode ?? null,
          category: d.category ?? null,
        })
        .returning({ id: schema.shopProduct.id });
      if (row && d.stock > 0)
        await t
          .insert(schema.shopStockMove)
          .values({ shopId: sc.shopId, productId: row.id, qty: d.stock, reason: "initial", note: "Importación", stockAfter: d.stock, createdBy: sc.userId });
    }
    await touch(t, sc.shopId);
  });
  return summarize(items.map((i) => i.row));
}
