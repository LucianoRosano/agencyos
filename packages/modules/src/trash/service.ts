import { assertCan, type Ctx, L, label, notFound, type Resource, validation } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { getDb } from "../shared/db";
import { ENTITIES, type EntityType, isEntityType } from "../shared/entities";

const RESOURCE: Partial<Record<EntityType, Resource>> = {
  client: "crm", contact: "crm", opportunity: "crm", interaction: "crm",
  project: "project", task: "task", decision: "project", deliverable: "project", project_template: "project",
  quote: "quote", service: "service",
  note: "note", course: "study", assessment: "study",
  transaction: "finance", receivable: "finance", payable: "finance", subscription: "finance", account: "finance",
  reminder: "reminder", inbox_item: "inbox", space: "space",
};

// biome-ignore lint/suspicious/noExplicitAny: acceso genérico a columnas comunes
type AnyTable = PgTable & Record<string, any>;

function resolve(type: string) {
  if (!isEntityType(type)) throw validation("Tipo de elemento inválido");
  const def = ENTITIES[type];
  return { def, table: def.table as unknown as AnyTable, resource: RESOURCE[type] ?? "settings" };
}

async function setColumn(ctx: Ctx, type: string, id: string, column: "deletedAt" | "archivedAt", value: Date | null, verb: string, summary: string) {
  const { table, resource } = resolve(type);
  assertCan(ctx, "delete", resource);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(table)
      .set({ [column]: value, updatedAt: new Date() })
      .where(and(eq(table.id, id), eq(table.workspaceId, ctx.workspaceId)))
      .returning();
    if (!row) throw notFound();
    const title = String(row[ENTITIES[type as EntityType].title] ?? "").slice(0, 80);
    await recordEvent(t, ctx, { type: `${type}.${verb}`, entityType: type, entityId: id, summary: `${summary} ${label(L.entityType, type).toLowerCase()} «${title}»` });
    return row;
  });
}

/** Manda a la papelera (30 días, restaurable). */
export const moveToTrash = (ctx: Ctx, type: string, id: string) => setColumn(ctx, type, id, "deletedAt", new Date(), "eliminado", "Envió a la papelera");
export async function restoreFromTrash(ctx: Ctx, type: string, id: string) {
  // Los movimientos tienen pares (transferencias) y saldos asociados: los restaura Finanzas.
  if (type === "transaction") {
    const { deleteTransaction } = await import("../finance/service");
    return deleteTransaction(ctx, id, true);
  }
  return setColumn(ctx, type, id, "deletedAt", null, "restaurado", "Restauró");
}
export const archive = (ctx: Ctx, type: string, id: string) => setColumn(ctx, type, id, "archivedAt", new Date(), "archivado", "Archivó");
export const unarchive = (ctx: Ctx, type: string, id: string) => setColumn(ctx, type, id, "archivedAt", null, "desarchivado", "Desarchivó");

export async function listTrash(ctx: Ctx) {
  const db = getDb();
  const out: { type: EntityType; id: string; title: string; deletedAt: Date }[] = [];
  for (const [type, def] of Object.entries(ENTITIES) as [EntityType, (typeof ENTITIES)[EntityType]][]) {
    if (type === "space" || type === "account") continue;
    const table = def.table as unknown as AnyTable;
    const rows = await db
      .select({ id: table.id, title: table[def.title], deletedAt: table.deletedAt })
      .from(table)
      .where(and(eq(table.workspaceId, ctx.workspaceId), isNotNull(table.deletedAt)))
      .orderBy(desc(table.deletedAt))
      .limit(100);
    for (const r of rows) out.push({ type, id: r.id as string, title: String(r.title ?? "").slice(0, 120), deletedAt: r.deletedAt as Date });
  }
  return out.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}

/** Purga definitiva de lo que lleva más de 30 días en la papelera (job diario). */
export async function purgeTrash(olderThanDays = 30): Promise<number> {
  const db = getDb();
  const limit = new Date(Date.now() - olderThanDays * 86_400_000);
  let total = 0;
  for (const def of Object.values(ENTITIES)) {
    const table = def.table as unknown as AnyTable;
    const res = await db.delete(table).where(and(isNotNull(table.deletedAt), lt(table.deletedAt, limit)));
    total += res.rowCount ?? 0;
  }
  if (total > 0) {
    await db.insert(schema.auditLog).values({ actorType: "system", action: "trash.purged", after: { count: total } });
  }
  return total;
}

export async function purgeOne(ctx: Ctx, type: string, id: string) {
  if (type === "transaction") throw validation("Los movimientos se eliminan definitivamente solos a los 30 días (con su par de transferencia).");
  const { table, resource } = resolve(type);
  assertCan(ctx, "delete", resource);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .delete(table)
      .where(and(eq(table.id, id), eq(table.workspaceId, ctx.workspaceId), isNotNull(table.deletedAt)))
      .returning();
    if (!row) throw notFound();
    await t.insert(schema.auditLog).values({ workspaceId: ctx.workspaceId, actorType: ctx.actor.type, actorId: ctx.actor.id, action: "entity.purged", targetType: type, targetId: id, before: row as object });
    return true;
  });
}

export const trashCount = async (ctx: Ctx) => (await listTrash(ctx)).length;
export { sql };
