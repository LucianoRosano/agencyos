import { assertCan, type Ctx } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { signPath, verifySignedPath } from "../shared/crypto";
import { assertFullAccess, getDb, projectScope, scoped } from "../shared/db";
import { ENTITIES, type EntityType, entityHref, isEntityType } from "../shared/entities";
import { ATTACHABLE, quotaBytes, storageUsed } from "./service";

export const SMART_VIEWS = ["logos", "imagenes", "documentos", "ultimos"] as const;
export type SmartView = (typeof SMART_VIEWS)[number];

export type FileFilters = {
  view?: string;
  q?: string;
  clientId?: string;
  projectId?: string;
  siteId?: string;
  kind?: string;
  folderId?: string;
  /** solo archivos sueltos (sin carpeta) del nivel actual */
  rootOnly?: boolean;
  /** nivel del explorador: sin cliente / sin proyecto */
  noClient?: boolean;
  noProject?: boolean;
  limit?: number;
};

// --- URLs firmadas (5 min) ---

export type FileUrlOpts = { v?: number; thumb?: boolean; dl?: boolean };

/** Path canónico que se firma (el orden de los parámetros importa). */
export function canonicalFilePath(id: string, o: FileUrlOpts = {}) {
  const q = [o.v ? `v=${o.v}` : null, o.thumb ? "thumb=1" : null, o.dl ? "dl=1" : null].filter(Boolean).join("&");
  return `/api/files/${id}${q ? `?${q}` : ""}`;
}
export const signedFileUrl = (id: string, o: FileUrlOpts = {}) => signPath(canonicalFilePath(id, o));
export function verifyFileUrl(id: string, params: URLSearchParams) {
  const o: FileUrlOpts = { v: Number(params.get("v")) || undefined, thumb: params.get("thumb") === "1", dl: params.get("dl") === "1" };
  return { ok: verifySignedPath(canonicalFilePath(id, o), params.get("exp"), params.get("sig")), opts: o };
}

// --- Listados ---

export async function listFiles(ctx: Ctx, f: FileFilters = {}) {
  assertCan(ctx, "read", "project");
  assertFullAccess(ctx);
  const db = getDb();
  const where = [scoped(schema.file, ctx)];
  if (f.view === "logos") where.push(eq(schema.file.kind, "logo"));
  else if (f.view === "imagenes") where.push(inArray(schema.file.kind, ["image", "logo"]));
  else if (f.view === "documentos") where.push(inArray(schema.file.kind, ["document", "pdf"]));
  if (f.kind) where.push(eq(schema.file.kind, f.kind));
  if (f.clientId) where.push(eq(schema.file.clientId, f.clientId));
  else if (f.noClient) where.push(isNull(schema.file.clientId));
  if (f.projectId) where.push(eq(schema.file.projectId, f.projectId));
  else if (f.noProject) where.push(isNull(schema.file.projectId));
  if (f.siteId) where.push(eq(schema.file.siteId, f.siteId));
  if (f.folderId) where.push(eq(schema.file.folderId, f.folderId));
  else if (f.rootOnly) where.push(isNull(schema.file.folderId));
  if (f.q)
    where.push(
      sql`(f_search_norm(${schema.file.name}) like '%' || f_search_norm(${f.q}) || '%' or f_search_norm(coalesce(${schema.file.description}, '')) like '%' || f_search_norm(${f.q}) || '%')`,
    );
  const rows = await db
    .select({ f: schema.file, clientName: schema.client.name, projectName: schema.project.name })
    .from(schema.file)
    .leftJoin(schema.client, and(eq(schema.client.id, schema.file.clientId), eq(schema.client.workspaceId, schema.file.workspaceId)))
    .leftJoin(schema.project, and(eq(schema.project.id, schema.file.projectId), eq(schema.project.workspaceId, schema.file.workspaceId)))
    .where(and(...where))
    .orderBy(desc(schema.file.createdAt))
    .limit(Math.min(f.limit ?? (f.view === "ultimos" ? 50 : 300), 500));
  return rows.map((r) => ({ ...r, thumbUrl: r.f.thumbKey ? signedFileUrl(r.f.id, { thumb: true, v: r.f.currentVersion }) : null }));
}
export type FileListItem = Awaited<ReturnType<typeof listFiles>>[number];

export async function listFolders(ctx: Ctx, f: { parentId?: string | null; clientId?: string; projectId?: string } = {}) {
  const where = [scoped(schema.folder, ctx)];
  where.push(f.parentId ? eq(schema.folder.parentId, f.parentId) : isNull(schema.folder.parentId));
  if (!f.parentId) {
    where.push(f.clientId ? eq(schema.folder.clientId, f.clientId) : isNull(schema.folder.clientId));
    where.push(f.projectId ? eq(schema.folder.projectId, f.projectId) : isNull(schema.folder.projectId));
  }
  const folders = await getDb()
    .select()
    .from(schema.folder)
    .where(and(...where))
    .orderBy(asc(schema.folder.name));
  if (!folders.length) return [];
  const counts = await getDb()
    .select({ folderId: schema.file.folderId, n: sql<number>`count(*)::int` })
    .from(schema.file)
    .where(
      and(
        scoped(schema.file, ctx),
        inArray(
          schema.file.folderId,
          folders.map((x) => x.id),
        ),
      ),
    )
    .groupBy(schema.file.folderId);
  return folders.map((x) => ({ ...x, files: counts.find((c) => c.folderId === x.id)?.n ?? 0 }));
}

export async function getFolder(ctx: Ctx, id: string) {
  const db = getDb();
  const [folder] = await db
    .select()
    .from(schema.folder)
    .where(and(eq(schema.folder.id, id), scoped(schema.folder, ctx)));
  if (!folder) return null;
  // ruta (migas de pan), máximo 10 niveles
  const path: { id: string; name: string }[] = [{ id: folder.id, name: folder.name }];
  let parentId = folder.parentId;
  for (let i = 0; parentId && i < 10; i++) {
    const [p] = await db
      .select({ id: schema.folder.id, name: schema.folder.name, parentId: schema.folder.parentId })
      .from(schema.folder)
      .where(and(eq(schema.folder.id, parentId), scoped(schema.folder, ctx)));
    if (!p) break;
    path.unshift({ id: p.id, name: p.name });
    parentId = p.parentId;
  }
  return { folder, path };
}

/** Todas las carpetas (para selects de mover). */
export async function folderOptions(ctx: Ctx) {
  const rows = await getDb()
    .select({ id: schema.folder.id, name: schema.folder.name, parentId: schema.folder.parentId, clientName: schema.client.name })
    .from(schema.folder)
    .leftJoin(schema.client, and(eq(schema.client.id, schema.folder.clientId), eq(schema.client.workspaceId, schema.folder.workspaceId)))
    .where(scoped(schema.folder, ctx))
    .orderBy(asc(schema.folder.name));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const label = (r: (typeof rows)[number]) => {
    const parts = [r.name];
    let p = r.parentId ? byId.get(r.parentId) : undefined;
    for (let i = 0; p && i < 10; i++) {
      parts.unshift(p.name);
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return `${r.clientName ? `${r.clientName} › ` : ""}${parts.join(" / ")}`;
  };
  return rows.map((r) => ({ value: r.id, label: label(r) })).sort((a, b) => a.label.localeCompare(b.label, "es"));
}

export async function siteOptions(ctx: Ctx) {
  const rows = await getDb()
    .select({ id: schema.site.id, name: schema.site.name })
    .from(schema.site)
    .where(scoped(schema.site, ctx))
    .orderBy(asc(schema.site.name));
  return rows.map((s) => ({ value: s.id, label: s.name }));
}

// --- Ficha ---

export async function getFile(ctx: Ctx, id: string) {
  assertCan(ctx, "read", "project");
  const db = getDb();
  const [row] = await db
    .select({ f: schema.file, clientName: schema.client.name, projectName: schema.project.name, siteName: schema.site.name, folderName: schema.folder.name })
    .from(schema.file)
    .leftJoin(schema.client, and(eq(schema.client.id, schema.file.clientId), eq(schema.client.workspaceId, schema.file.workspaceId)))
    .leftJoin(schema.project, and(eq(schema.project.id, schema.file.projectId), eq(schema.project.workspaceId, schema.file.workspaceId)))
    .leftJoin(schema.site, and(eq(schema.site.id, schema.file.siteId), eq(schema.site.workspaceId, schema.file.workspaceId)))
    .leftJoin(schema.folder, and(eq(schema.folder.id, schema.file.folderId), eq(schema.folder.workspaceId, schema.file.workspaceId)))
    .where(and(eq(schema.file.id, id), scoped(schema.file, ctx)));
  if (!row) return null;
  const [versions, attachments, tags, uploaders] = await Promise.all([
    db
      .select()
      .from(schema.fileVersion)
      .where(and(eq(schema.fileVersion.workspaceId, ctx.workspaceId), eq(schema.fileVersion.fileId, id)))
      .orderBy(desc(schema.fileVersion.version)),
    attachmentTargets(ctx, id),
    db
      .select({ name: schema.tag.name })
      .from(schema.tagging)
      .innerJoin(schema.tag, eq(schema.tag.id, schema.tagging.tagId))
      .where(and(eq(schema.tagging.workspaceId, ctx.workspaceId), eq(schema.tagging.entityType, "file"), eq(schema.tagging.entityId, id)))
      .orderBy(asc(schema.tag.name)),
    db
      .select({ id: schema.user.id, name: schema.user.name })
      .from(schema.user)
      .innerJoin(schema.membership, eq(schema.membership.userId, schema.user.id))
      .where(eq(schema.membership.workspaceId, ctx.workspaceId)),
  ]);
  const who = new Map(uploaders.map((u) => [u.id, u.name]));
  return {
    ...row,
    tags: tags.map((t) => t.name),
    versions: versions.map((v) => ({
      ...v,
      uploadedByName: v.uploadedBy ? (who.get(v.uploadedBy) ?? null) : null,
      downloadUrl: signedFileUrl(id, { v: v.version, dl: true }),
    })),
    attachments,
    previewUrl: signedFileUrl(id, { v: row.f.currentVersion }),
    thumbUrl: row.f.thumbKey ? signedFileUrl(id, { thumb: true, v: row.f.currentVersion }) : null,
    downloadUrl: signedFileUrl(id, { v: row.f.currentVersion, dl: true }),
  };
}

/** Dónde está adjuntado un archivo (con título y enlace de cada entidad). */
async function attachmentTargets(ctx: Ctx, fileId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.fileAttachment)
    .where(and(eq(schema.fileAttachment.workspaceId, ctx.workspaceId), eq(schema.fileAttachment.fileId, fileId)))
    .orderBy(desc(schema.fileAttachment.createdAt));
  const out: { id: string; entityType: string; entityId: string; title: string; href: string }[] = [];
  for (const a of rows) {
    if (!isEntityType(a.entityType)) continue;
    const def = ENTITIES[a.entityType as EntityType];
    // biome-ignore lint/suspicious/noExplicitAny: acceso genérico por registro de entidades
    const table = def.table as any;
    const [e] = await db
      .select({ title: table[def.title] })
      .from(table)
      .where(and(eq(table.id, a.entityId), scoped(table, ctx, { withArchived: true })));
    if (!e) continue;
    out.push({
      id: a.id,
      entityType: a.entityType,
      entityId: a.entityId,
      title: String(e.title ?? "").slice(0, 120),
      href: entityHref(a.entityType, a.entityId),
    });
  }
  return out;
}

/** Adjuntos de una entidad (para el componente <Attachments>). */
export async function attachmentsOf(ctx: Ctx, entityType: string, entityId: string) {
  assertCan(ctx, "read", ATTACHABLE[entityType as EntityType] ?? "project");
  if (!/^[0-9a-f-]{36}$/i.test(entityId)) return [];
  const rows = await getDb()
    .select({ a: schema.fileAttachment, f: schema.file })
    .from(schema.fileAttachment)
    .innerJoin(schema.file, and(eq(schema.file.id, schema.fileAttachment.fileId), eq(schema.file.workspaceId, schema.fileAttachment.workspaceId)))
    .where(
      and(
        eq(schema.fileAttachment.workspaceId, ctx.workspaceId),
        eq(schema.fileAttachment.entityType, entityType),
        eq(schema.fileAttachment.entityId, entityId),
        scoped(schema.file, ctx),
        projectScope(ctx, schema.file.projectId),
      ),
    )
    .orderBy(desc(schema.fileAttachment.createdAt));
  return rows.map(({ a, f }) => toAttachmentItem(a.id, f));
}

export function toAttachmentItem(attachmentId: string, f: typeof schema.file.$inferSelect) {
  return {
    attachmentId,
    fileId: f.id,
    name: f.name,
    mime: f.mime,
    kind: f.kind,
    size: f.size,
    version: f.currentVersion,
    thumbUrl: f.thumbKey ? signedFileUrl(f.id, { thumb: true, v: f.currentVersion }) : null,
    downloadUrl: signedFileUrl(f.id, { v: f.currentVersion, dl: true }),
  };
}
export type AttachmentItem = ReturnType<typeof toAttachmentItem>;

/** Para el selector "Elegir de la biblioteca". */
export async function pickerFiles(ctx: Ctx, q?: string, kinds?: string[]) {
  const rows = await listFiles(ctx, { q: q?.slice(0, 80), limit: 40 });
  return rows
    .filter((r) => !kinds?.length || kinds.includes(r.f.kind))
    .map((r) => ({ id: r.f.id, name: r.f.name, kind: r.f.kind, size: r.f.size, clientName: r.clientName, thumbUrl: r.thumbUrl }));
}
export type PickerFile = Awaited<ReturnType<typeof pickerFiles>>[number];

export async function storageUsage(ctx: Ctx) {
  const db = getDb();
  const [ws] = await db.select({ settings: schema.workspace.settings }).from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId));
  return { used: await storageUsed(db, ctx.workspaceId), limit: quotaBytes(ws?.settings) };
}

/** Clientes y proyectos que tienen archivos (navegación cliente → proyecto). */
export async function libraryTree(ctx: Ctx) {
  const db = getDb();
  const rows = await db
    .select({
      clientId: schema.file.clientId,
      clientName: schema.client.name,
      projectId: schema.file.projectId,
      projectName: schema.project.name,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.file)
    .leftJoin(schema.client, and(eq(schema.client.id, schema.file.clientId), eq(schema.client.workspaceId, schema.file.workspaceId)))
    .leftJoin(schema.project, and(eq(schema.project.id, schema.file.projectId), eq(schema.project.workspaceId, schema.file.workspaceId)))
    .where(scoped(schema.file, ctx))
    .groupBy(schema.file.clientId, schema.client.name, schema.file.projectId, schema.project.name);
  const clients = new Map<string, { id: string; name: string; n: number; projects: { id: string; name: string; n: number }[] }>();
  for (const r of rows) {
    if (!r.clientId || !r.clientName) continue;
    const c = clients.get(r.clientId) ?? { id: r.clientId, name: r.clientName, n: 0, projects: [] };
    c.n += r.n;
    if (r.projectId && r.projectName) c.projects.push({ id: r.projectId, name: r.projectName, n: r.n });
    clients.set(r.clientId, c);
  }
  return [...clients.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// --- Kit de marca ---

export async function getBrandKit(ctx: Ctx, clientId: string) {
  const db = getDb();
  const [client] = await db
    .select({ id: schema.client.id, name: schema.client.name })
    .from(schema.client)
    .where(and(eq(schema.client.id, clientId), scoped(schema.client, ctx, { withArchived: true })));
  if (!client) return null;
  const [kit] = await db
    .select()
    .from(schema.brandKit)
    .where(and(scoped(schema.brandKit, ctx), eq(schema.brandKit.clientId, clientId)));
  const ids = [...(kit?.logoFileIds ?? []), ...(kit?.guidelinesFileId ? [kit.guidelinesFileId] : [])];
  const files = ids.length
    ? await db
        .select()
        .from(schema.file)
        .where(and(scoped(schema.file, ctx), inArray(schema.file.id, ids)))
    : [];
  const item = (f: typeof schema.file.$inferSelect) => ({
    id: f.id,
    name: f.name,
    kind: f.kind,
    size: f.size,
    mime: f.mime,
    width: f.width,
    height: f.height,
    thumbUrl: f.thumbKey ? signedFileUrl(f.id, { thumb: true, v: f.currentVersion }) : null,
    downloadUrl: signedFileUrl(f.id, { v: f.currentVersion, dl: true }),
  });
  const logos = (kit?.logoFileIds ?? []).map((id) => files.find((f) => f.id === id)).filter((f): f is NonNullable<typeof f> => Boolean(f));
  const guidelines = kit?.guidelinesFileId ? files.find((f) => f.id === kit.guidelinesFileId) : undefined;
  return {
    client,
    kit: kit ?? null,
    colors: kit?.colors ?? [],
    fonts: kit?.fonts ?? [],
    notesMd: kit?.notesMd ?? null,
    logos: logos.map(item),
    guidelines: guidelines ? item(guidelines) : null,
  };
}

export async function listBrandKits(ctx: Ctx) {
  return getDb()
    .select({ clientId: schema.brandKit.clientId, clientName: schema.client.name, colors: schema.brandKit.colors, logos: schema.brandKit.logoFileIds })
    .from(schema.brandKit)
    .innerJoin(schema.client, and(eq(schema.client.id, schema.brandKit.clientId), eq(schema.client.workspaceId, schema.brandKit.workspaceId)))
    .where(and(scoped(schema.brandKit, ctx), isNull(schema.client.deletedAt)))
    .orderBy(asc(schema.client.name));
}

// --- Plantillas ---

export async function listTemplates(ctx: Ctx, f: { kind?: string; q?: string } = {}) {
  const where = [scoped(schema.reusableTemplate, ctx)];
  if (f.kind) where.push(eq(schema.reusableTemplate.kind, f.kind));
  if (f.q)
    where.push(
      sql`(f_search_norm(${schema.reusableTemplate.name}) like '%' || f_search_norm(${f.q}) || '%' or f_search_norm(${schema.reusableTemplate.bodyMd}) like '%' || f_search_norm(${f.q}) || '%')`,
    );
  return getDb()
    .select()
    .from(schema.reusableTemplate)
    .where(and(...where))
    .orderBy(asc(schema.reusableTemplate.name))
    .limit(500);
}
