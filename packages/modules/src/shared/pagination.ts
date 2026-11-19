import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Paginación por cursor (keyset) para listas que crecen (docs/SCALING.md §Paginación).
 *
 * - El orden se describe con `SortKey[]` (la última clave debe ser única, p. ej. `id`).
 * - El cursor es la tupla de valores de la última fila, renderizada POR POSTGRES (`json_build_array`) para no perder
 *   precisión (timestamps con microsegundos) y codificada en base64url. Un cursor inválido se ignora.
 * - "Cargar más" acumulativo y sin JS: la URL lleva `?hasta=<cursor>` = "mostrar todo hasta esa fila + la página
 *   siguiente". Dos consultas: filas `<= cursor` (tope `maxRows`) y `pageSize + 1` filas `> cursor`. Estable ante
 *   altas/bajas (no usa OFFSET).
 */
export type SortKey = { col: AnyPgColumn | SQL; dir: "asc" | "desc"; nulls?: "first" | "last" };
export type CursorValue = string | number | boolean | null;

const nullsOf = (k: SortKey) => k.nulls ?? (k.dir === "asc" ? "last" : "first"); // defaults de Postgres

export function orderByKeys(keys: SortKey[]): SQL[] {
  return keys.map((k) => sql`${k.col} ${sql.raw(k.dir)} nulls ${sql.raw(nullsOf(k))}`);
}

/** Columna `_cursor` para el select: tupla de claves como JSON (texto). */
export function cursorColumn(keys: SortKey[]): SQL<string> {
  return sql<string>`json_build_array(${sql.join(
    keys.map((k) => k.col),
    sql`, `,
  )})::text`;
}

export function encodeCursor(json: string): string {
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined, n: number): CursorValue[] | null {
  if (!cursor || cursor.length > 1000 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return null;
  try {
    const v: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Array.isArray(v) || v.length !== n) return null;
    if (!v.every((x) => x === null || ["string", "number", "boolean"].includes(typeof x))) return null;
    return v as CursorValue[];
  } catch {
    return null;
  }
}

/** Filas estrictamente DESPUÉS de la tupla `vals` en el orden `keys` (null-safe: nunca devuelve NULL). */
export function keysetAfter(keys: SortKey[], vals: CursorValue[]): SQL {
  const build = (i: number): SQL => {
    const k = keys[i] as SortKey;
    const v = vals[i] as CursorValue;
    const last = i === keys.length - 1;
    const nullsLast = nullsOf(k) === "last";
    let gt: SQL;
    let eq: SQL;
    if (v === null) {
      // Después de un NULL: si los NULL van al final, solo otros NULL (desempate); si van al principio, todo lo no nulo.
      gt = nullsLast ? sql`false` : sql`${k.col} is not null`;
      eq = sql`${k.col} is null`;
    } else {
      const cmp = k.dir === "asc" ? sql`${k.col} > ${v}` : sql`${k.col} < ${v}`;
      gt = nullsLast ? sql`(${cmp} or ${k.col} is null)` : sql`(${k.col} is not null and ${cmp})`;
      eq = sql`${k.col} = ${v}`;
    }
    return last ? gt : sql`(${gt} or (${eq} and ${build(i + 1)}))`;
  };
  return sql`coalesce(${build(0)}, false)`;
}

/** Filas hasta la tupla `vals` inclusive (complemento exacto de keysetAfter). */
export function keysetUpTo(keys: SortKey[], vals: CursorValue[]): SQL {
  return sql`not ${keysetAfter(keys, vals)}`;
}

export type Page<T> = { items: T[]; nextCursor: string | null; capped: boolean };

/**
 * Ejecuta la paginación acumulativa. `fetch(where, limit)` debe aplicar `where` (si viene), ordenar con
 * `orderByKeys(keys)` y seleccionar `_cursor: cursorColumn(keys)`.
 */
export async function paginate<T extends { _cursor: string }>(
  keys: SortKey[],
  fetch: (where: SQL | undefined, limit: number) => Promise<T[]>,
  opts: { hasta?: string | null; pageSize?: number; maxRows?: number } = {},
): Promise<Page<T>> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 100, 1), 500);
  const maxRows = opts.maxRows ?? 2000;
  const vals = decodeCursor(opts.hasta, keys.length);
  let head: T[] = [];
  if (vals) {
    head = await fetch(keysetUpTo(keys, vals), maxRows + 1);
    if (head.length > maxRows) return { items: head.slice(0, maxRows), nextCursor: null, capped: true };
  }
  const tail = await fetch(vals ? keysetAfter(keys, vals) : undefined, pageSize + 1);
  const shown = tail.slice(0, pageSize);
  const items = [...head, ...shown];
  const last = items.at(-1);
  const hasMore = tail.length > pageSize;
  if (hasMore && items.length >= maxRows) return { items, nextCursor: null, capped: true };
  return { items, nextCursor: hasMore && last ? encodeCursor(last._cursor) : null, capped: false };
}
