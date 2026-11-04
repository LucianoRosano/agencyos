import { getDb, type DbOrTx, type Tx } from "@agencyos/db";
import { type Ctx, notFound } from "@agencyos/core";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

export { getDb };

type Scoped = { workspaceId: PgColumn; deletedAt?: PgColumn; archivedAt?: PgColumn };

/** Filtro obligatorio por workspace (+ excluye papelera por defecto). */
export function scoped(table: Scoped, ctx: Pick<Ctx, "workspaceId">, opts: { withDeleted?: boolean; withArchived?: boolean } = {}): SQL {
  const parts: SQL[] = [eq(table.workspaceId, ctx.workspaceId)];
  if (!opts.withDeleted && table.deletedAt) parts.push(isNull(table.deletedAt));
  if (!opts.withArchived && table.archivedAt) parts.push(isNull(table.archivedAt));
  return and(...parts) as SQL;
}

export async function tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(fn);
}

export type { DbOrTx, Tx };


/**
 * Verifica que un id recibido del cliente pertenezca al workspace (y no esté en la papelera).
 * Las tablas de negocio no tienen FKs: esta verificación es la barrera de aislamiento al escribir.
 */
export async function assertOwned(
  db: DbOrTx,
  ctx: Pick<Ctx, "workspaceId">,
  // biome-ignore lint/suspicious/noExplicitAny: tabla genérica con id/workspaceId/deletedAt
  table: PgTable & { id: any; workspaceId: any; deletedAt?: any },
  id: string | null | undefined,
  what: string,
): Promise<void> {
  if (!id) return;
  // biome-ignore lint/suspicious/noExplicitAny: select genérico
  const [row] = await (db as any).select({ id: table.id }).from(table).where(and(scoped(table, ctx, { withArchived: true }), eq(table.id, id))).limit(1);
  if (!row) throw notFound(what);
}
