import { type Ctx, L, label } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, desc, eq, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";
import { ENTITIES, entityHref, isEntityType } from "../shared/entities";
import { hasPlainMention, normName } from "./parse";

export type NoteFilters = { q?: string; spaceId?: string; folder?: string; tag?: string; limit?: number };

const noteCols = {
  id: schema.note.id,
  title: schema.note.title,
  folderPath: schema.note.folderPath,
  spaceId: schema.note.spaceId,
  isDaily: schema.note.isDaily,
  pinned: schema.note.pinned,
  wordCount: schema.note.wordCount,
  updatedAt: schema.note.updatedAt,
  createdAt: schema.note.createdAt,
  entityType: schema.note.entityType,
  entityId: schema.note.entityId,
  spaceName: schema.space.name,
  spaceColor: schema.space.color,
  snippet: sql<string>`left(regexp_replace(regexp_replace(regexp_replace(${schema.note.bodyMd}, '^---.*?\\n---\\s*', ''), '[#>*_\`\\[\\]]+', '', 'g'), '\\s+', ' ', 'g'), 180)`,
};

/** Lista de notas: búsqueda de texto completo (tolerante a tildes y errores leves) + filtros, orden por modificación. */
export async function listNotes(ctx: Ctx, f: NoteFilters = {}) {
  const where: SQL[] = [scoped(schema.note, ctx)];
  if (f.spaceId) where.push(eq(schema.note.spaceId, f.spaceId));
  if (f.folder)
    where.push(or(eq(schema.note.folderPath, f.folder), sql`${schema.note.folderPath} like ${`${f.folder.replace(/[%_\\]/g, (c) => `\\${c}`)}/%`}`) as SQL);
  if (f.folder === "") where.push(isNull(schema.note.folderPath));
  if (f.tag) {
    where.push(
      sql`exists (select 1 from ${schema.tagging} tg join ${schema.tag} t on t.id = tg.tag_id where tg.entity_type = 'note' and tg.entity_id = ${schema.note.id} and t.name = ${f.tag.toLowerCase()})`,
    );
  }
  const term = f.q?.trim().slice(0, 100);
  let rank: SQL = sql`0`;
  if (term) {
    const norm = sql`f_search_norm(${term})`;
    const fts = sql`to_tsvector('spanish', f_unaccent(${schema.note.bodyMd})) @@ plainto_tsquery('spanish', f_unaccent(${term}))`;
    where.push(sql`(f_search_norm(${schema.note.title}) like '%' || ${norm} || '%' or f_search_norm(${schema.note.title}) % ${norm} or ${fts})`);
    rank = sql`greatest(similarity(f_search_norm(${schema.note.title}), ${norm}) + case when f_search_norm(${schema.note.title}) like '%' || ${norm} || '%' then 0.5 else 0 end, case when ${fts} then 0.3 else 0 end)`;
  }
  return getDb()
    .select(noteCols)
    .from(schema.note)
    .leftJoin(schema.space, eq(schema.space.id, schema.note.spaceId))
    .where(and(...where))
    .orderBy(...(term ? [desc(rank)] : [desc(schema.note.pinned)]), desc(schema.note.updatedAt))
    .limit(f.limit ?? 300);
}

export type FolderNode = { name: string; path: string; count: number; children: FolderNode[] };

/** Árbol de carpetas (cuenta incluye subcarpetas). */
export async function folderTree(ctx: Ctx): Promise<{ tree: FolderNode[]; unfiled: number; total: number }> {
  const rows = await getDb()
    .select({ path: schema.note.folderPath, n: sql<number>`count(*)::int` })
    .from(schema.note)
    .where(scoped(schema.note, ctx))
    .groupBy(schema.note.folderPath);
  const root: FolderNode = { name: "", path: "", count: 0, children: [] };
  let unfiled = 0;
  let total = 0;
  for (const r of rows) {
    total += r.n;
    if (!r.path) {
      unfiled += r.n;
      continue;
    }
    let cur = root;
    const parts = r.path.split("/");
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join("/");
      let next = cur.children.find((c) => c.name === name);
      if (!next) {
        next = { name, path, count: 0, children: [] };
        cur.children.push(next);
      }
      next.count += r.n;
      cur = next;
    });
  }
  const sort = (n: FolderNode) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name, "es"));
    n.children.forEach(sort);
  };
  sort(root);
  return { tree: root.children, unfiled, total };
}

/** Etiquetas usadas en notas, con conteo. */
export async function noteTags(ctx: Ctx) {
  return getDb()
    .select({ name: schema.tag.name, color: schema.tag.color, n: sql<number>`count(*)::int` })
    .from(schema.tagging)
    .innerJoin(schema.tag, eq(schema.tag.id, schema.tagging.tagId))
    .innerJoin(schema.note, eq(schema.note.id, schema.tagging.entityId))
    .where(and(eq(schema.tagging.workspaceId, ctx.workspaceId), eq(schema.tagging.entityType, "note"), scoped(schema.note, ctx)))
    .groupBy(schema.tag.name, schema.tag.color)
    .orderBy(asc(schema.tag.name));
}

type Titled = { id: string; title: string; status: string | null };

/** Títulos de entidades de cualquier tipo registrado (filtrando workspace y papelera). */
export async function entityTitles(ctx: Ctx, type: string, ids: string[]): Promise<Map<string, Titled>> {
  const out = new Map<string, Titled>();
  if (!ids.length || !isEntityType(type)) return out;
  const def = ENTITIES[type];
  // biome-ignore lint/suspicious/noExplicitAny: acceso genérico a columnas comunes del registro de entidades
  const table = def.table as any;
  const rows = (await getDb()
    .select({ id: table.id, title: table[def.title], status: "status" in table ? table.status : sql`null` })
    .from(table)
    .where(and(inArray(table.id, ids), scoped(table, ctx)))) as { id: string; title: string; status: string | null }[];
  for (const r of rows) out.set(r.id, { id: r.id, title: String(r.title ?? "").slice(0, 160), status: r.status ?? null });
  return out;
}

export type Connection = { type: string; id: string; title: string; href: string; status: string | null; direction: "in" | "out" | "both"; kinds: string[] };

/** "Conectado con": enlaces entrantes y salientes de una entidad, agrupados por tipo (N5). */
export async function connectionsOf(ctx: Ctx, type: string, id: string) {
  const rows = await getDb()
    .select()
    .from(schema.link)
    .where(
      and(
        eq(schema.link.workspaceId, ctx.workspaceId),
        or(and(eq(schema.link.fromType, type), eq(schema.link.fromId, id)), and(eq(schema.link.toType, type), eq(schema.link.toId, id))),
      ),
    );
  const acc = new Map<string, { type: string; id: string; dir: Set<"in" | "out">; kinds: Set<string> }>();
  for (const r of rows) {
    const out = r.fromType === type && r.fromId === id;
    const other = out ? { type: r.toType, id: r.toId } : { type: r.fromType, id: r.fromId };
    if (other.type === type && other.id === id) continue;
    const key = `${other.type}:${other.id}`;
    const cur = acc.get(key) ?? { ...other, dir: new Set(), kinds: new Set() };
    cur.dir.add(out ? "out" : "in");
    cur.kinds.add(r.kind);
    acc.set(key, cur);
  }
  const byType = new Map<string, string[]>();
  for (const c of acc.values()) byType.set(c.type, [...(byType.get(c.type) ?? []), c.id]);
  const titles = new Map<string, Titled>();
  await Promise.all(
    [...byType].map(async ([t, ids]) => {
      for (const [k, v] of await entityTitles(ctx, t, ids)) titles.set(`${t}:${k}`, v);
    }),
  );
  const list: Connection[] = [];
  for (const [key, c] of acc) {
    const t = titles.get(key);
    if (!t) continue; // eliminado o de otro workspace
    list.push({
      type: c.type,
      id: c.id,
      title: t.title,
      href: entityHref(c.type, c.id),
      status: t.status,
      direction: c.dir.size === 2 ? "both" : c.dir.has("out") ? "out" : "in",
      kinds: [...c.kinds],
    });
  }
  const groups = new Map<string, Connection[]>();
  for (const c of list.sort((a, b) => a.title.localeCompare(b.title, "es"))) groups.set(c.type, [...(groups.get(c.type) ?? []), c]);
  return [...groups].map(([t, items]) => ({ type: t, label: label(L.entityType, t), items }));
}

/** Notas que mencionan el título (o un alias) en texto plano sin enlazarla. */
export async function unlinkedMentions(ctx: Ctx, note: { id: string; title: string; aliases: string[] }) {
  const names = [note.title, ...note.aliases].filter((n) => normName(n).length >= 3);
  if (!names.length) return [];
  const likes = names.map((n) => sql`f_search_norm(${schema.note.bodyMd}) like ${`%${normName(n).replace(/[%_\\]/g, (c) => `\\${c}`)}%`}`);
  const rows = await getDb()
    .select({ id: schema.note.id, title: schema.note.title, bodyMd: schema.note.bodyMd, updatedAt: schema.note.updatedAt })
    .from(schema.note)
    .where(
      and(
        scoped(schema.note, ctx),
        ne(schema.note.id, note.id),
        sql`(${sql.join(likes, sql` or `)})`,
        sql`not exists (select 1 from ${schema.link} l where l.workspace_id = ${ctx.workspaceId} and l.from_type = 'note' and l.from_id = ${schema.note.id} and l.to_type = 'note' and l.to_id = ${note.id} and l.kind = 'wikilink')`,
      ),
    )
    .orderBy(desc(schema.note.updatedAt))
    .limit(60);
  return rows
    .filter((r) => names.some((n) => hasPlainMention(r.bodyMd, n)))
    .slice(0, 20)
    .map((r) => {
      const norm = normName(r.bodyMd);
      const at = names.map((n) => norm.indexOf(normName(n))).find((i) => i >= 0) ?? 0;
      const excerpt = r.bodyMd
        .replace(/\s+/g, " ")
        .slice(Math.max(0, at - 60), at + 90)
        .trim();
      return { id: r.id, title: r.title, excerpt, updatedAt: r.updatedAt };
    });
}

export async function getNote(ctx: Ctx, id: string) {
  const [row] = await getDb()
    .select({ n: schema.note, spaceName: schema.space.name, spaceColor: schema.space.color })
    .from(schema.note)
    .leftJoin(schema.space, eq(schema.space.id, schema.note.spaceId))
    .where(and(eq(schema.note.id, id), scoped(schema.note, ctx)));
  if (!row) return null;
  const entity = row.n.entityType && row.n.entityId ? ((await entityTitles(ctx, row.n.entityType, [row.n.entityId])).get(row.n.entityId) ?? null) : null;
  return { ...row, entity: entity && row.n.entityType ? { type: row.n.entityType, ...entity, href: entityHref(row.n.entityType, entity.id) } : null };
}

export async function listVersions(ctx: Ctx, noteId: string) {
  return getDb()
    .select({ id: schema.noteVersion.id, title: schema.noteVersion.title, bodyMd: schema.noteVersion.bodyMd, createdAt: schema.noteVersion.createdAt })
    .from(schema.noteVersion)
    .where(and(eq(schema.noteVersion.workspaceId, ctx.workspaceId), eq(schema.noteVersion.noteId, noteId)))
    .orderBy(desc(schema.noteVersion.createdAt))
    .limit(100);
}

/** Notas que pertenecen a una entidad (ficha de proyecto, cliente, materia…). */
export async function notesForEntity(ctx: Ctx, entityType: string, entityId: string) {
  return getDb()
    .select({ id: schema.note.id, title: schema.note.title, updatedAt: schema.note.updatedAt })
    .from(schema.note)
    .where(and(scoped(schema.note, ctx), eq(schema.note.entityType, entityType), eq(schema.note.entityId, entityId)))
    .orderBy(desc(schema.note.updatedAt));
}

/** Opciones para vincular una nota a una entidad. */
export async function linkableEntities(ctx: Ctx) {
  const db = getDb();
  const [projects, clients, courses] = await Promise.all([
    db
      .select({ id: schema.project.id, name: schema.project.name })
      .from(schema.project)
      .where(scoped(schema.project, ctx))
      .orderBy(asc(schema.project.name))
      .limit(500),
    db
      .select({ id: schema.client.id, name: schema.client.name })
      .from(schema.client)
      .where(scoped(schema.client, ctx))
      .orderBy(asc(schema.client.name))
      .limit(500),
    db
      .select({ id: schema.course.id, name: schema.course.name })
      .from(schema.course)
      .where(scoped(schema.course, ctx))
      .orderBy(asc(schema.course.name))
      .limit(200),
  ]);
  return [
    ...projects.map((p) => ({ value: `project:${p.id}`, label: `Proyecto · ${p.name}` })),
    ...clients.map((c) => ({ value: `client:${c.id}`, label: `Cliente · ${c.name}` })),
    ...courses.map((c) => ({ value: `course:${c.id}`, label: `Materia · ${c.name}` })),
  ];
}

/** Carpetas existentes (para autocompletar). */
export async function folderPaths(ctx: Ctx) {
  const rows = await getDb()
    .selectDistinct({ p: schema.note.folderPath })
    .from(schema.note)
    .where(and(scoped(schema.note, ctx), sql`${schema.note.folderPath} is not null`))
    .orderBy(asc(schema.note.folderPath));
  return rows.map((r) => r.p as string);
}
