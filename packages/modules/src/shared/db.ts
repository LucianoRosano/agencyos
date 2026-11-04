import type { Ctx } from "@agencyos/core";
import { type DbOrTx, getDb, type Tx } from "@agencyos/db";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

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
