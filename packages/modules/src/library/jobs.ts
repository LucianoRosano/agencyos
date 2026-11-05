import { schema } from "@agencyos/db";
import { inArray, sql } from "drizzle-orm";
import { getDb } from "../shared/db";
import { getStorage } from "../shared/storage";
import { thumbKeyFor } from "./service";

/**
 * Limpieza de huérfanos (job diario, después de la purga de la papelera):
 * versiones y adjuntos de archivos que ya no existen (purgados) → se borran del storage y de la base.
 * Un blob se borra solo si ningún archivo vivo lo sigue usando (las restauraciones reutilizan blobs).
 */
export async function cleanupOrphanFiles(): Promise<{ blobs: number; versions: number; attachments: number }> {
  const db = getDb();
  const orphans = await db.execute<{ id: string; storage_key: string }>(
    sql`select v.id, v.storage_key from file_version v where not exists (select 1 from file f where f.id = v.file_id) limit 5000`,
  );
  let blobs = 0;
  const storage = getStorage();
  for (const key of new Set(orphans.rows.map((r) => r.storage_key))) {
    const used = await db.execute(
      sql`select 1 from file_version v join file f on f.id = v.file_id where v.storage_key = ${key} union all select 1 from file f where f.storage_key = ${key} limit 1`,
    );
    if (used.rows.length) continue;
    await storage.delete(key).catch(() => {});
    await storage.delete(thumbKeyFor(key)).catch(() => {});
    blobs++;
  }
  let versions = 0;
  if (orphans.rows.length) {
    const ids = orphans.rows.map((r) => r.id);
    const del = await db.delete(schema.fileVersion).where(inArray(schema.fileVersion.id, ids));
    versions = del.rowCount ?? 0;
  }
  const att = await db.execute(sql`delete from file_attachment a where not exists (select 1 from file f where f.id = a.file_id)`);
  if (blobs || versions) {
    await db
      .insert(schema.auditLog)
      .values({ actorType: "system", action: "library.orphans_cleaned", after: { blobs, versions, attachments: att.rowCount ?? 0 } });
  }
  return { blobs, versions, attachments: att.rowCount ?? 0 };
}
