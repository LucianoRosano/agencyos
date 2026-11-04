import { assertCan, type Ctx, conflict, notFound, todayAR, validation, zDate, zOptDate, zOptUuid, zRequired } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema, type Tx } from "@agencyos/db";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, scoped } from "../shared/db";
import {
  countWords, frontmatterAliases, frontmatterTags, linkFirstPlainMention, normalizeFolder, normName, parseFrontmatter, parseMentions, parseWikilinks,
  renameWikilinks, slugify,
} from "./parse";

/** Entidades a las que se puede vincular una nota. */
export const NOTE_ENTITY_TYPES = ["project", "client", "contact", "course", "task"] as const;
/** Una versión como mucho cada 5 minutos de edición. */
export const VERSION_INTERVAL_MS = 5 * 60_000;

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const zAliases = z.preprocess(
  (v) => (typeof v === "string" ? v.split(",") : v),
  z.array(z.string().trim().max(120)).max(30).optional(),
);
const zFlag = z.preprocess((v) => (v === undefined ? undefined : v === "on" || v === "true" || v === true || v === "1"), z.boolean().optional());

export const noteInput = z
  .object({
    title: zRequired(200, "El título"),
    spaceId: zOptUuid,
    // (zOptText de core falla con "" en zod 4: se usa el preprocess por fuera del optional)
    folderPath: z.preprocess(emptyToUndef, z.string().trim().max(300, "Máximo 300 caracteres").optional()),
    bodyMd: z.string().max(500_000, "La nota es demasiado larga").optional(),
    entityType: z.preprocess(emptyToUndef, z.enum(NOTE_ENTITY_TYPES).optional()),
    entityId: zOptUuid,
    isDaily: zFlag,
    dailyDate: zOptDate,
    aliases: zAliases,
    pinned: zFlag,
  })
  .superRefine((v, c) => {
    if (Boolean(v.entityType) !== Boolean(v.entityId)) c.addIssue({ code: "custom", path: ["entityId"], message: "Elegí el elemento a vincular" });
    if (/[[\]|#^]/.test(v.title)) c.addIssue({ code: "custom", path: ["title"], message: "El título no puede tener [ ] | # ^" });
  });

/** Edición parcial (autoguardado y propiedades). */
export const notePatch = z
  .object({
    title: zRequired(200, "El título").optional(),
    bodyMd: z.string().max(500_000, "La nota es demasiado larga").optional(),
    spaceId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable().optional()),
    folderPath: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(300).nullable().optional()),
    entityType: z.preprocess((v) => (v === "" ? null : v), z.enum(NOTE_ENTITY_TYPES).nullable().optional()),
    entityId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable().optional()),
    aliases: zAliases,
    pinned: zFlag,
  })
  .superRefine((v, c) => {
    if (v.title && /[[\]|#^]/.test(v.title)) c.addIssue({ code: "custom", path: ["title"], message: "El título no puede tener [ ] | # ^" });
  });

type NoteRow = typeof schema.note.$inferSelect;

const titleNorm = sql`f_search_norm(${schema.note.title})`;

async function assertUniqueTitle(t: Tx, ctx: Ctx, title: string, exceptId?: string) {
  const where = [scoped(schema.note, ctx), eq(titleNorm, normName(title))];
  if (exceptId) where.push(ne(schema.note.id, exceptId));
  const [dup] = await t.select({ id: schema.note.id }).from(schema.note).where(and(...where)).limit(1);
  if (dup) throw validation("Ya existe una nota con ese título", { title: "Ya existe una nota con ese título" });
}

/** Slug único en el workspace (incluye la papelera, porque el índice único también). */
async function uniqueSlug(t: Tx, ctx: Ctx, title: string, exceptId?: string) {
  const base = slugify(title);
  const rows = await t
    .select({ id: schema.note.id, slug: schema.note.slug })
    .from(schema.note)
    .where(and(eq(schema.note.workspaceId, ctx.workspaceId), sql`(${schema.note.slug} = ${base} or ${schema.note.slug} like ${`${base}-%`})`));
  const taken = new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

async function assertEntity(t: Tx, ctx: Ctx, type: string | null | undefined, id: string | null | undefined) {
  if (!type || !id) return;
  const table = { project: schema.project, client: schema.client, contact: schema.contact, course: schema.course, task: schema.task }[type as (typeof NOTE_ENTITY_TYPES)[number]];
  if (!table) throw validation("Tipo de vínculo inválido");
  const [row] = await t.select({ id: table.id }).from(table).where(and(eq(table.id, id), scoped(table, ctx)));
  if (!row) throw notFound("El elemento vinculado");
}

/** Notas por título o alias (normalizados). */
export async function resolveNoteTitles(t: Tx | ReturnType<typeof getDb>, ctx: Ctx, titles: string[]) {
  const norms = [...new Set(titles.map(normName).filter(Boolean))];
  const out = new Map<string, { id: string; title: string }>();
  if (!norms.length) return out;
  const aliasMatch = sql`exists (select 1 from unnest(${schema.note.aliases}) a where f_search_norm(a) in (${sql.join(norms.map((n) => sql`${n}`), sql`, `)}))`;
  const rows = await t
    .select({ id: schema.note.id, title: schema.note.title, aliases: schema.note.aliases })
    .from(schema.note)
    .where(and(scoped(schema.note, ctx), sql`(${inArray(titleNorm, norms)} or ${aliasMatch})`));
  // Los títulos ganan a los alias
  for (const r of rows) for (const a of r.aliases) if (norms.includes(normName(a)) && !out.has(normName(a))) out.set(normName(a), { id: r.id, title: r.title });
  for (const r of rows) if (norms.includes(normName(r.title))) out.set(normName(r.title), { id: r.id, title: r.title });
  return out;
}

/** Resuelve menciones contra clientes (@), contactos (@) y proyectos (#) por nombre exacto sin tildes. */
async function resolveMentions(t: Tx, ctx: Ctx, md: string) {
  const mentions = parseMentions(md);
  if (!mentions.length) return [] as { type: "client" | "contact" | "project"; id: string }[];
  const at = [...new Set(mentions.filter((m) => m.sigil === "@").flatMap((m) => m.candidates.map(normName)))];
  const hash = [...new Set(mentions.filter((m) => m.sigil === "#").flatMap((m) => m.candidates.map(normName)))];
  // Secuencial: dentro de una transacción hay un solo cliente de Postgres.
  const clients = at.length
    ? await t.select({ id: schema.client.id, name: schema.client.name, trade: schema.client.tradeName }).from(schema.client)
        .where(and(scoped(schema.client, ctx), sql`(${inArray(sql`f_search_norm(${schema.client.name})`, at)} or ${inArray(sql`f_search_norm(coalesce(${schema.client.tradeName}, ''))`, at)})`))
    : [];
  const contacts = at.length
    ? await t.select({ id: schema.contact.id, name: schema.contact.name }).from(schema.contact).where(and(scoped(schema.contact, ctx), inArray(sql`f_search_norm(${schema.contact.name})`, at)))
    : [];
  const projects = hash.length
    ? await t.select({ id: schema.project.id, name: schema.project.name }).from(schema.project).where(and(scoped(schema.project, ctx), inArray(sql`f_search_norm(${schema.project.name})`, hash)))
    : [];
  const byName = new Map<string, { type: "client" | "contact" | "project"; id: string }>();
  for (const c of contacts) byName.set(`@${normName(c.name)}`, { type: "contact", id: c.id });
  for (const c of clients) {
    byName.set(`@${normName(c.name)}`, { type: "client", id: c.id });
    if (c.trade) byName.set(`@${normName(c.trade)}`, { type: "client", id: c.id });
  }
  for (const p of projects) byName.set(`#${normName(p.name)}`, { type: "project", id: p.id });
  const out: { type: "client" | "contact" | "project"; id: string }[] = [];
  for (const m of mentions) {
    const hit = m.candidates.map((c) => byName.get(`${m.sigil}${normName(c)}`)).find(Boolean);
    if (hit) out.push(hit);
  }
  return out;
}

/** Reemplaza los enlaces salientes (wikilinks + menciones) de la nota según su texto actual. */
async function syncLinks(t: Tx, ctx: Ctx, note: Pick<NoteRow, "id" | "bodyMd">) {
  const body = parseFrontmatter(note.bodyMd).body;
  const wikis = parseWikilinks(body);
  const targets = await resolveNoteTitles(t, ctx, wikis.map((w) => w.target));
  const rows = new Map<string, { toType: string; toId: string; kind: string }>();
  for (const w of wikis) {
    const hit = targets.get(normName(w.target));
    if (hit && hit.id !== note.id) rows.set(`note:${hit.id}:wikilink`, { toType: "note", toId: hit.id, kind: "wikilink" });
  }
  for (const m of await resolveMentions(t, ctx, body)) rows.set(`${m.type}:${m.id}:mention`, { toType: m.type, toId: m.id, kind: "mention" });
  await t
    .delete(schema.link)
    .where(and(eq(schema.link.workspaceId, ctx.workspaceId), eq(schema.link.fromType, "note"), eq(schema.link.fromId, note.id), inArray(schema.link.kind, ["wikilink", "mention"])));
  if (rows.size) {
    await t
      .insert(schema.link)
      .values([...rows.values()].map((r) => ({ workspaceId: ctx.workspaceId, fromType: "note", fromId: note.id, ...r, createdBy: ctx.userId })))
      .onConflictDoNothing();
  }
  return { wikilinks: wikis.length, resolved: [...rows.values()].filter((r) => r.kind === "wikilink").length, mentions: [...rows.values()].filter((r) => r.kind === "mention").length };
}

/** Etiquetas del frontmatter → `tag` + `tagging` (compartidas en el workspace, N6). */
async function syncTags(t: Tx, ctx: Ctx, noteId: string, names: string[]) {
  await t.delete(schema.tagging).where(and(eq(schema.tagging.workspaceId, ctx.workspaceId), eq(schema.tagging.entityType, "note"), eq(schema.tagging.entityId, noteId)));
  if (!names.length) return;
  await t.insert(schema.tag).values(names.map((name) => ({ workspaceId: ctx.workspaceId, name, createdBy: ctx.userId }))).onConflictDoNothing();
  const tags = await t.select({ id: schema.tag.id }).from(schema.tag).where(and(eq(schema.tag.workspaceId, ctx.workspaceId), inArray(schema.tag.name, names)));
  if (tags.length) await t.insert(schema.tagging).values(tags.map((g) => ({ workspaceId: ctx.workspaceId, tagId: g.id, entityType: "note", entityId: noteId }))).onConflictDoNothing();
}

/**
 * Al crear o renombrar una nota, otras notas que ya la enlazaban por texto (`[[Título]]`) pasan a tener el enlace real.
 */
async function resyncNotesMentioning(t: Tx, ctx: Ctx, titles: string[], exceptId: string) {
  const pats = [...new Set(titles.map(normName).filter(Boolean))].map((n) => `%[[${n.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  if (!pats.length) return;
  const rows = await t
    .select({ id: schema.note.id, bodyMd: schema.note.bodyMd })
    .from(schema.note)
    .where(and(scoped(schema.note, ctx), ne(schema.note.id, exceptId), sql`(${sql.join(pats.map((p) => sql`f_search_norm(${schema.note.bodyMd}) like ${p}`), sql` or `)})`))
    .limit(500);
  for (const r of rows) await syncLinks(t, ctx, r);
}

async function snapshot(t: Tx, ctx: Ctx, note: Pick<NoteRow, "id" | "title" | "bodyMd">) {
  await t.insert(schema.noteVersion).values({ workspaceId: ctx.workspaceId, noteId: note.id, title: note.title, bodyMd: note.bodyMd, createdBy: ctx.userId ?? ctx.actor.id });
}

function derived(bodyMd: string, extraAliases: string[] = []) {
  const fm = parseFrontmatter(bodyMd);
  return {
    frontmatter: fm.data as Record<string, unknown>,
    tags: frontmatterTags(fm.data),
    aliases: [...new Set([...extraAliases, ...frontmatterAliases(fm.data)].map((a) => a.trim()).filter(Boolean))].slice(0, 30),
    wordCount: countWords(bodyMd),
  };
}

async function insertNote(t: Tx, ctx: Ctx, input: z.infer<typeof noteInput>) {
  await assertUniqueTitle(t, ctx, input.title);
  await assertEntity(t, ctx, input.entityType, input.entityId);
  const bodyMd = input.bodyMd ?? "";
  const d = derived(bodyMd, input.aliases);
  let spaceId = input.spaceId ?? null;
  if (!spaceId && input.entityType === "project" && input.entityId) {
    const [p] = await t.select({ s: schema.project.spaceId }).from(schema.project).where(eq(schema.project.id, input.entityId));
    spaceId = p?.s ?? null;
  }
  const [row] = await t
    .insert(schema.note)
    .values({
      workspaceId: ctx.workspaceId,
      createdBy: ctx.userId ?? ctx.actor.id,
      title: input.title,
      slug: await uniqueSlug(t, ctx, input.title),
      spaceId,
      folderPath: normalizeFolder(input.folderPath),
      bodyMd,
      frontmatter: d.frontmatter,
      aliases: d.aliases,
      wordCount: d.wordCount,
      isDaily: input.isDaily ?? false,
      dailyDate: input.isDaily ? input.dailyDate ?? todayAR() : null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      pinned: input.pinned ?? false,
    })
    .returning();
  if (!row) throw new Error("No se pudo crear la nota");
  await syncLinks(t, ctx, row);
  await syncTags(t, ctx, row.id, d.tags);
  await resyncNotesMentioning(t, ctx, [row.title, ...row.aliases], row.id);
  if (bodyMd.trim()) await snapshot(t, ctx, row);
  await recordEvent(t, ctx, { type: "nota.creada", entityType: "note", entityId: row.id, summary: `Creó la nota «${row.title}»` });
  return row;
}

export async function createNote(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "note");
  const input = noteInput.parse(raw);
  return getDb().transaction((t) => insertNote(t, ctx, input));
}

export type SaveResult = { note: NoteRow; versioned: boolean; links: { wikilinks: number; resolved: number; mentions: number } | null };

async function applyPatch(t: Tx, ctx: Ctx, id: string, input: z.infer<typeof notePatch>): Promise<SaveResult> {
  const [before] = await t.select().from(schema.note).where(and(eq(schema.note.id, id), scoped(schema.note, ctx))).for("update");
  if (!before) throw notFound("La nota");
  const title = input.title ?? before.title;
  const bodyMd = input.bodyMd ?? before.bodyMd;
  const renamed = normName(title) !== normName(before.title);
  if (renamed) await assertUniqueTitle(t, ctx, title, id);
  const entityType = input.entityType === undefined ? before.entityType : input.entityType;
  const entityId = input.entityId === undefined ? before.entityId : input.entityId;
  if (Boolean(entityType) !== Boolean(entityId)) throw validation("Elegí el elemento a vincular", { entityId: "Elegí el elemento a vincular" });
  if (entityId !== before.entityId) await assertEntity(t, ctx, entityType, entityId);
  const bodyChanged = bodyMd !== before.bodyMd;
  const manualAliases = input.aliases ?? before.aliases.filter((a) => !frontmatterAliases(parseFrontmatter(before.bodyMd).data).includes(a));
  const d = derived(bodyMd, manualAliases);
  const [row] = await t
    .update(schema.note)
    .set({
      title,
      slug: title !== before.title ? await uniqueSlug(t, ctx, title, id) : before.slug,
      bodyMd,
      frontmatter: d.frontmatter,
      aliases: d.aliases,
      wordCount: d.wordCount,
      spaceId: input.spaceId === undefined ? before.spaceId : input.spaceId,
      folderPath: input.folderPath === undefined ? before.folderPath : normalizeFolder(input.folderPath),
      entityType,
      entityId,
      pinned: input.pinned ?? before.pinned,
      lastOpenedAt: new Date(),
    })
    .where(eq(schema.note.id, id))
    .returning();
  if (!row) throw notFound("La nota");
  let links: SaveResult["links"] = null;
  if (bodyChanged) {
    links = await syncLinks(t, ctx, row);
    await syncTags(t, ctx, id, d.tags);
  }
  if (renamed) {
    // Obsidian reescribe los [[enlaces]] al renombrar: acá también, en las notas que enlazan a esta.
    const sources = await t
      .select({ id: schema.note.id, bodyMd: schema.note.bodyMd })
      .from(schema.link)
      .innerJoin(schema.note, eq(schema.note.id, schema.link.fromId))
      .where(and(eq(schema.link.workspaceId, ctx.workspaceId), eq(schema.link.toType, "note"), eq(schema.link.toId, id), eq(schema.link.kind, "wikilink"), eq(schema.link.fromType, "note"), scoped(schema.note, ctx)));
    for (const s of sources) {
      const next = renameWikilinks(s.bodyMd, before.title, title);
      if (next !== s.bodyMd) await t.update(schema.note).set({ bodyMd: next }).where(eq(schema.note.id, s.id));
    }
    await resyncNotesMentioning(t, ctx, [title, ...row.aliases], id);
  }
  let versioned = false;
  if (bodyChanged || renamed) {
    const [last] = await t.select({ at: schema.noteVersion.createdAt }).from(schema.noteVersion).where(eq(schema.noteVersion.noteId, id)).orderBy(desc(schema.noteVersion.createdAt)).limit(1);
    if (!last || Date.now() - last.at.getTime() >= VERSION_INTERVAL_MS) {
      await snapshot(t, ctx, row);
      versioned = true;
    }
  }
  // Actividad: una entrada por versión o cambio de propiedades, no por cada autoguardado.
  if (versioned || renamed || (!bodyChanged && input.title === undefined)) {
    await recordEvent(t, ctx, {
      type: renamed ? "nota.renombrada" : "nota.editada",
      entityType: "note",
      entityId: id,
      summary: renamed ? `Renombró la nota «${before.title}» → «${title}»` : `Editó la nota «${title}»`,
    });
  }
  return { note: row, versioned, links };
}

/** Autoguardado y edición de propiedades: transacción con enlaces, etiquetas y versión (≤ 1 cada 5 min). */
export async function updateNote(ctx: Ctx, id: string, raw: unknown): Promise<SaveResult> {
  assertCan(ctx, "update", "note");
  const input = notePatch.parse(raw);
  return getDb().transaction((t) => applyPatch(t, ctx, id, input));
}

export async function setNotePinned(ctx: Ctx, id: string, pinned: boolean) {
  assertCan(ctx, "update", "note");
  const [row] = await getDb().update(schema.note).set({ pinned }).where(and(eq(schema.note.id, id), scoped(schema.note, ctx))).returning();
  if (!row) throw notFound("La nota");
  return row;
}

/** Restaura una versión: antes guarda la actual como versión, así se puede volver atrás. */
export async function restoreVersion(ctx: Ctx, versionId: string) {
  assertCan(ctx, "update", "note");
  z.string().uuid("Versión inválida").parse(versionId);
  return getDb().transaction(async (t) => {
    const [v] = await t.select().from(schema.noteVersion).where(and(eq(schema.noteVersion.id, versionId), eq(schema.noteVersion.workspaceId, ctx.workspaceId)));
    if (!v) throw notFound("La versión");
    const [cur] = await t.select().from(schema.note).where(and(eq(schema.note.id, v.noteId), scoped(schema.note, ctx)));
    if (!cur) throw notFound("La nota");
    if (cur.bodyMd === v.bodyMd) throw conflict("La nota ya tiene ese contenido.");
    await snapshot(t, ctx, cur);
    // Se restaura el contenido; el título actual se conserva (renombrar reescribe enlaces en otras notas).
    const res = await applyPatch(t, ctx, cur.id, { bodyMd: v.bodyMd });
    await recordEvent(t, ctx, { type: "nota.version_restaurada", entityType: "note", entityId: cur.id, summary: `Restauró una versión de «${res.note.title}»` });
    return res.note;
  });
}

/** Convierte una mención en texto plano (en otra nota) en `[[enlace]]` a esta nota. */
export async function linkUnlinkedMention(ctx: Ctx, sourceNoteId: string, targetNoteId: string) {
  assertCan(ctx, "update", "note");
  return getDb().transaction(async (t) => {
    const [target] = await t.select().from(schema.note).where(and(eq(schema.note.id, targetNoteId), scoped(schema.note, ctx)));
    const [source] = await t.select().from(schema.note).where(and(eq(schema.note.id, sourceNoteId), scoped(schema.note, ctx)));
    if (!target || !source) throw notFound("La nota");
    const next = [target.title, ...target.aliases].map((name) => linkFirstPlainMention(source.bodyMd, name)).find((x): x is string => Boolean(x));
    if (!next) throw validation(`No se encontró «${target.title}» como texto en «${source.title}».`);
    const res = await applyPatch(t, ctx, source.id, { bodyMd: next });
    return res.note;
  });
}

/** Nota diaria de la fecha (por defecto hoy, zona AR): la abre o la crea en la carpeta "Diario". */
export async function getOrCreateDaily(ctx: Ctx, date: string = todayAR()) {
  const day = zDate.parse(date);
  const db = getDb();
  const [existing] = await db.select().from(schema.note).where(and(scoped(schema.note, ctx), eq(schema.note.isDaily, true), eq(schema.note.dailyDate, day))).limit(1);
  if (existing) return existing;
  assertCan(ctx, "create", "note");
  return db.transaction(async (t) => {
    const spaces = await t.select().from(schema.space).where(scoped(schema.space, ctx)).orderBy(asc(schema.space.sort));
    const space = spaces.find((s) => s.kind === "personal") ?? spaces[0];
    const [clash] = await t.select({ id: schema.note.id }).from(schema.note).where(and(scoped(schema.note, ctx), eq(titleNorm, normName(day)))).limit(1);
    return insertNote(t, ctx, {
      title: clash ? `${day} (diaria)` : day,
      spaceId: space?.id,
      folderPath: "Diario",
      bodyMd: "## Foco\n- \n\n## Notas\n\n## Para mañana\n- ",
      isDaily: true,
      dailyDate: day,
    });
  });
}
