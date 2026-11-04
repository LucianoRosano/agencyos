import { assertCan, type Ctx, toISODateAR } from "@agencyos/core";
import { audit } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, asc, eq } from "drizzle-orm";
import JSZip from "jszip";
import { getDb, scoped } from "../shared/db";
import { type Frontmatter, parseFrontmatter, safeFileName, stringifyFrontmatter } from "./parse";

/**
 * Exporta todas las notas a un ZIP compatible con un vault de Obsidian:
 * un `.md` por nota (frontmatter YAML + cuerpo), respetando las carpetas.
 */
export async function exportNotesZip(ctx: Ctx): Promise<{ data: ArrayBuffer; count: number; filename: string }> {
  assertCan(ctx, "read", "note");
  assertCan(ctx, "read", "export");
  const db = getDb();
  const rows = await db
    .select({ n: schema.note, spaceName: schema.space.name })
    .from(schema.note)
    .leftJoin(schema.space, eq(schema.space.id, schema.note.spaceId))
    .where(and(scoped(schema.note, ctx, { withArchived: true })))
    .orderBy(asc(schema.note.folderPath), asc(schema.note.title));
  const zip = new JSZip();
  const used = new Set<string>();
  for (const { n, spaceName } of rows) {
    const folder = n.folderPath ? `${n.folderPath.split("/").map(safeFileName).join("/")}/` : "";
    let path = `${folder}${safeFileName(n.title)}.md`;
    for (let i = 2; used.has(path.toLowerCase()); i++) path = `${folder}${safeFileName(n.title)} (${i}).md`;
    used.add(path.toLowerCase());
    const fm = parseFrontmatter(n.bodyMd);
    const data: Frontmatter = { ...fm.data };
    if (n.aliases.length) data.aliases = n.aliases;
    if (spaceName && data.espacio === undefined) data.espacio = spaceName;
    if (n.isDaily && n.dailyDate) data.fecha = n.dailyDate;
    data.creado = toISODateAR(n.createdAt);
    data.actualizado = toISODateAR(n.updatedAt);
    zip.file(path, `${stringifyFrontmatter(data)}${fm.body}`, { date: n.updatedAt });
  }
  const data = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
  await audit(db, ctx, { action: "notes.exported", targetType: "note", after: { count: rows.length } });
  return { data, count: rows.length, filename: `agencyos-notas-${toISODateAR(new Date())}.zip` };
}
