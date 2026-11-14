import { assertCan, type Ctx, notFound, type Resource, validation, zOptText, zOptUuid, zRequired, zUuid } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema, type Tx } from "@agencyos/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { assertOwned, getDb, scoped } from "../shared/db";
import { ENTITIES, type EntityType } from "../shared/entities";
import { getStorage, newStorageKey, sha256 } from "../shared/storage";
import { DEFAULT_QUOTA_MB, detectType, extOf, FILE_KINDS, MAX_FILE_BYTES, normalizeFileName, sanitizeSvg, THUMBABLE } from "./magic";

const R: Resource = "project"; // la Biblioteca usa los permisos de Proyectos (miembros pueden subir y editar)

/** Entidades a las que se puede adjuntar un archivo y el permiso que exige cada una. */
export const ATTACHABLE: Partial<Record<EntityType, Resource>> = {
  task: "task",
  project: "project",
  client: "crm",
  opportunity: "crm",
  interaction: "crm",
  note: "note",
  quote: "quote",
  transaction: "finance",
  receivable: "finance",
  payable: "finance",
  site: "project",
  revision_item: "project",
};

export const thumbKeyFor = (storageKey: string) => `${storageKey}.thumb.webp`;

// --- Cuota ---

export function quotaBytes(settings: unknown): number {
  const mb = Number((settings as { storageQuotaMb?: unknown } | null)?.storageQuotaMb);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_QUOTA_MB) * 1024 * 1024;
}

/** Bytes usados: suma de blobs distintos de todas las versiones (incluye papelera hasta la purga). */
export async function storageUsed(db: Tx | ReturnType<typeof getDb>, workspaceId: string): Promise<number> {
  const r = await db.execute<{ used: string | null }>(
    sql`select coalesce(sum(size), 0)::text as used from (select distinct storage_key, size from file_version where workspace_id = ${workspaceId}) v`,
  );
  return Number(r.rows[0]?.used ?? 0);
}

async function assertQuota(t: Tx, ctx: Ctx, extra: number) {
  // serializa las subidas del workspace para que dos en paralelo no pasen la cuota
  await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`quota:${ctx.workspaceId}`}))`);
  const [ws] = await t.select({ settings: schema.workspace.settings }).from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId));
  const limit = quotaBytes(ws?.settings);
  const used = await storageUsed(t, ctx.workspaceId);
  if (used + extra > limit) {
    const mb = (n: number) => `${Math.round(n / 1024 / 1024).toLocaleString("es-AR")} MB`;
    throw validation(`Se supera el espacio disponible: usás ${mb(used)} de ${mb(limit)}. Liberá espacio (papelera) o subí la cuota en Configuración.`, {
      file: "Sin espacio",
    });
  }
}

// --- Preparación del archivo (fuera de la transacción) ---

type Prepared = {
  name: string;
  ext: string;
  mime: string;
  kind: string;
  data: Buffer;
  hash: string;
  width: number | null;
  height: number | null;
  thumb: Buffer | null;
};

async function prepare(rawName: string, raw: Buffer): Promise<Prepared> {
  if (raw.length > MAX_FILE_BYTES) throw validation("El archivo supera los 100 MB.", { file: "Máximo 100 MB" });
  const name = normalizeFileName(rawName);
  const type = detectType(name, raw);
  const data = type.mime === "image/svg+xml" ? Buffer.from(sanitizeSvg(raw.toString("utf8")), "utf8") : raw;
  let width: number | null = null;
  let height: number | null = null;
  let thumb: Buffer | null = null;
  if (THUMBABLE.has(type.mime)) {
    try {
      const { default: sharp } = await import("sharp");
      const img = sharp(data, { animated: false, limitInputPixels: 100_000_000 });
      const meta = await img.metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
      thumb = await img.rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    } catch {
      // magic bytes correctos pero imagen corrupta: se guarda sin miniatura
      thumb = null;
    }
  }
  return { name, ext: type.ext, mime: type.mime, kind: type.kind, data, hash: sha256(data), width, height, thumb };
}

async function putBlobs(ws: string, p: Prepared) {
  const storage = getStorage();
  const key = newStorageKey(ws, p.ext);
  await storage.put(key, p.data);
  if (p.thumb) await storage.put(thumbKeyFor(key), p.thumb);
  return key;
}

async function dropBlobs(key: string | null) {
  if (!key) return;
  const storage = getStorage();
  await storage.delete(key).catch(() => {});
  await storage.delete(thumbKeyFor(key)).catch(() => {});
}

// --- Adjuntos: validación de entidad ---

async function assertAttachable(t: Tx, ctx: Ctx, entityType: string, entityId: string) {
  const resource = ATTACHABLE[entityType as EntityType];
  if (!resource) throw validation("No se pueden adjuntar archivos a este tipo de elemento.");
  assertCan(ctx, "update", resource);
  // biome-ignore lint/suspicious/noExplicitAny: tabla genérica del registro de entidades
  await assertOwned(t, ctx, ENTITIES[entityType as EntityType].table as any, entityId, "El elemento");
}

async function linkAttachment(t: Tx, ctx: Ctx, fileId: string, entityType: string, entityId: string, fileName: string) {
  const [exists] = await t
    .select({ id: schema.fileAttachment.id })
    .from(schema.fileAttachment)
    .where(
      and(
        eq(schema.fileAttachment.workspaceId, ctx.workspaceId),
        eq(schema.fileAttachment.fileId, fileId),
        eq(schema.fileAttachment.entityType, entityType),
        eq(schema.fileAttachment.entityId, entityId),
      ),
    );
  if (exists) return exists;
  const [row] = await t.insert(schema.fileAttachment).values({ workspaceId: ctx.workspaceId, fileId, entityType, entityId }).returning();
  await recordEvent(t, ctx, { type: "recurso.adjuntado", entityType, entityId, summary: `Adjuntó «${fileName}»`, payload: { fileId } });
  return row;
}

// --- Subida ---

export const uploadMeta = z.object({
  folderId: zOptUuid,
  clientId: zOptUuid,
  projectId: zOptUuid,
  siteId: zOptUuid,
  attachType: zOptText(40),
  attachId: zOptUuid,
  dedupe: z.preprocess((v) => v !== "0" && v !== false && v !== "false", z.boolean()).default(true),
});

/**
 * Sube un archivo: valida tipo real, sanitiza SVG, genera miniatura WebP, verifica cuota,
 * guarda en el storage y registra archivo + versión 1 (+ adjunto opcional).
 * Con `dedupe` (por defecto) si ya existe un archivo idéntico (SHA-256) devuelve ese.
 */
export async function uploadFile(ctx: Ctx, rawName: string, raw: Buffer, rawMeta: unknown = {}) {
  assertCan(ctx, "create", R);
  const meta = uploadMeta.parse(rawMeta);
  const p = await prepare(rawName, raw);
  let key: string | null = null;
  try {
    return await getDb().transaction(async (t) => {
      await assertOwned(t, ctx, schema.folder, meta.folderId, "La carpeta");
      await assertOwned(t, ctx, schema.client, meta.clientId, "El cliente");
      await assertOwned(t, ctx, schema.project, meta.projectId, "El proyecto");
      await assertOwned(t, ctx, schema.site, meta.siteId, "El sitio");
      const attach = meta.attachType && meta.attachId ? { type: meta.attachType, id: meta.attachId } : null;
      if (attach) await assertAttachable(t, ctx, attach.type, attach.id);
      if (meta.dedupe) {
        const [dup] = await t
          .select()
          .from(schema.file)
          .where(and(scoped(schema.file, ctx), eq(schema.file.sha256, p.hash)))
          .limit(1);
        if (dup) {
          if (attach) await linkAttachment(t, ctx, dup.id, attach.type, attach.id, dup.name);
          return { file: dup, duplicate: true };
        }
      }
      await assertQuota(t, ctx, p.data.length + (p.thumb?.length ?? 0));
      key = await putBlobs(ctx.workspaceId, p);
      let folder: { clientId: string | null; projectId: string | null } | undefined;
      if (meta.folderId) [folder] = await t.select().from(schema.folder).where(eq(schema.folder.id, meta.folderId));
      const [row] = await t
        .insert(schema.file)
        .values({
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
          folderId: meta.folderId ?? null,
          name: p.name,
          mime: p.mime,
          size: p.data.length,
          storageKey: key,
          sha256: p.hash,
          width: p.width,
          height: p.height,
          kind: p.kind,
          clientId: meta.clientId ?? folder?.clientId ?? null,
          projectId: meta.projectId ?? folder?.projectId ?? null,
          siteId: meta.siteId ?? null,
          origin: "upload",
          currentVersion: 1,
          thumbKey: p.thumb ? thumbKeyFor(key) : null,
        })
        .returning();
      if (!row) throw new Error("No se pudo guardar el archivo");
      await t.insert(schema.fileVersion).values({
        workspaceId: ctx.workspaceId,
        fileId: row.id,
        version: 1,
        storageKey: key,
        size: p.data.length,
        sha256: p.hash,
        uploadedBy: ctx.userId,
      });
      await recordEvent(t, ctx, { type: "recurso.subido", entityType: "file", entityId: row.id, summary: `Subió «${row.name}» a la Biblioteca` });
      if (attach) await linkAttachment(t, ctx, row.id, attach.type, attach.id, row.name);
      return { file: row, duplicate: false };
    });
  } catch (e) {
    await dropBlobs(key);
    throw e;
  }
}

/** Nueva versión: conserva el historial. Tiene que ser del mismo tipo que la actual. */
export async function uploadVersion(ctx: Ctx, fileId: string, rawName: string, raw: Buffer) {
  assertCan(ctx, "update", R);
  zUuid.parse(fileId);
  const p = await prepare(rawName, raw);
  let key: string | null = null;
  try {
    return await getDb().transaction(async (t) => {
      const [f] = await t
        .select()
        .from(schema.file)
        .where(and(eq(schema.file.id, fileId), scoped(schema.file, ctx)))
        .for("update");
      if (!f) throw notFound("El archivo");
      if (f.mime !== p.mime) throw validation(`La nueva versión tiene que ser del mismo tipo (.${extOf(f.name) || f.mime}).`, { file: "Otro tipo" });
      if (f.sha256 === p.hash) throw validation("Es idéntica a la versión actual.", { file: "Sin cambios" });
      await assertQuota(t, ctx, p.data.length + (p.thumb?.length ?? 0));
      key = await putBlobs(ctx.workspaceId, p);
      const version = f.currentVersion + 1;
      await t.insert(schema.fileVersion).values({
        workspaceId: ctx.workspaceId,
        fileId,
        version,
        storageKey: key,
        size: p.data.length,
        sha256: p.hash,
        uploadedBy: ctx.userId,
      });
      const [row] = await t
        .update(schema.file)
        .set({
          storageKey: key,
          size: p.data.length,
          sha256: p.hash,
          width: p.width,
          height: p.height,
          thumbKey: p.thumb ? thumbKeyFor(key) : null,
          currentVersion: version,
        })
        .where(eq(schema.file.id, fileId))
        .returning();
      await recordEvent(t, ctx, {
        type: "recurso.version_nueva",
        entityType: "file",
        entityId: fileId,
        summary: `Subió la versión ${version} de «${f.name}»`,
        payload: { version },
      });
      return row;
    });
  } catch (e) {
    await dropBlobs(key);
    throw e;
  }
}

/** Restaura una versión anterior: crea una versión nueva con ese contenido (el historial no se pierde). */
export async function restoreVersion(ctx: Ctx, fileId: string, rawVersion: unknown) {
  assertCan(ctx, "update", R);
  const versionNo = z.coerce.number().int().min(1).parse(rawVersion);
  return getDb().transaction(async (t) => {
    const [f] = await t
      .select()
      .from(schema.file)
      .where(and(eq(schema.file.id, fileId), scoped(schema.file, ctx)))
      .for("update");
    if (!f) throw notFound("El archivo");
    const [old] = await t
      .select()
      .from(schema.fileVersion)
      .where(and(eq(schema.fileVersion.workspaceId, ctx.workspaceId), eq(schema.fileVersion.fileId, fileId), eq(schema.fileVersion.version, versionNo)));
    if (!old) throw notFound("La versión");
    if (old.version === f.currentVersion) throw validation("Esa ya es la versión actual.");
    const version = f.currentVersion + 1;
    await t.insert(schema.fileVersion).values({
      workspaceId: ctx.workspaceId,
      fileId,
      version,
      storageKey: old.storageKey,
      size: old.size,
      sha256: old.sha256,
      uploadedBy: ctx.userId,
    });
    let dims: { width: number | null; height: number | null } = { width: f.width, height: f.height };
    const hasThumb = THUMBABLE.has(f.mime) && (await getStorage().exists(thumbKeyFor(old.storageKey)));
    if (THUMBABLE.has(f.mime)) {
      try {
        const { default: sharp } = await import("sharp");
        const m = await sharp(await getStorage().get(old.storageKey)).metadata();
        dims = { width: m.width ?? null, height: m.height ?? null };
      } catch {
        // dimensiones previas
      }
    }
    const [row] = await t
      .update(schema.file)
      .set({
        storageKey: old.storageKey,
        size: old.size,
        sha256: old.sha256,
        ...dims,
        thumbKey: hasThumb ? thumbKeyFor(old.storageKey) : null,
        currentVersion: version,
      })
      .where(eq(schema.file.id, fileId))
      .returning();
    await recordEvent(t, ctx, {
      type: "recurso.version_nueva",
      entityType: "file",
      entityId: fileId,
      summary: `Restauró la versión ${versionNo} de «${f.name}» (ahora v${version})`,
      payload: { version, restoredFrom: versionNo },
    });
    return row;
  });
}

// --- Metadatos ---

export const fileMetaInput = z.object({
  name: zRequired(120, "El nombre"),
  kind: z.enum(FILE_KINDS).optional(),
  description: zOptText(2000),
  folderId: zOptUuid,
  clientId: zOptUuid,
  projectId: zOptUuid,
  siteId: zOptUuid,
  tags: zOptText(300),
});

export async function updateFile(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", R);
  const input = fileMetaInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [f] = await t
      .select()
      .from(schema.file)
      .where(and(eq(schema.file.id, id), scoped(schema.file, ctx)));
    if (!f) throw notFound("El archivo");
    await assertOwned(t, ctx, schema.folder, input.folderId, "La carpeta");
    await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
    await assertOwned(t, ctx, schema.project, input.projectId, "El proyecto");
    await assertOwned(t, ctx, schema.site, input.siteId, "El sitio");
    // la extensión no se cambia: define el tipo real validado al subir
    const ext = extOf(f.name);
    let name = normalizeFileName(input.name);
    if (ext && extOf(name) !== ext) name = normalizeFileName(`${name.replace(/\.[a-z0-9]{1,8}$/i, "")}.${ext}`);
    const isImage = f.kind === "image" || f.kind === "logo";
    const kind = input.kind && isImage && (input.kind === "image" || input.kind === "logo") ? input.kind : f.kind;
    const [row] = await t
      .update(schema.file)
      .set({
        name,
        kind,
        description: input.description ?? null,
        folderId: input.folderId ?? null,
        clientId: input.clientId ?? null,
        projectId: input.projectId ?? null,
        siteId: input.siteId ?? null,
      })
      .where(eq(schema.file.id, id))
      .returning();
    if (raw && typeof raw === "object" && "tags" in raw) await setTags(t, ctx, id, input.tags ?? "");
    await recordEvent(t, ctx, { type: "recurso.actualizado", entityType: "file", entityId: id, summary: `Editó «${name}»` });
    return row;
  });
}

async function setTags(t: Tx, ctx: Ctx, fileId: string, csv: string) {
  const names = [
    ...new Set(
      csv
        .split(",")
        .map((s) => s.trim().replace(/^#/, "").toLowerCase())
        .filter((s) => s.length > 0 && s.length <= 40),
    ),
  ].slice(0, 20);
  await t
    .delete(schema.tagging)
    .where(and(eq(schema.tagging.workspaceId, ctx.workspaceId), eq(schema.tagging.entityType, "file"), eq(schema.tagging.entityId, fileId)));
  if (!names.length) return;
  await t
    .insert(schema.tag)
    .values(names.map((name) => ({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, name })))
    .onConflictDoNothing();
  const tags = await t
    .select({ id: schema.tag.id })
    .from(schema.tag)
    .where(and(eq(schema.tag.workspaceId, ctx.workspaceId), inArray(schema.tag.name, names)));
  if (tags.length)
    await t
      .insert(schema.tagging)
      .values(tags.map((tg) => ({ workspaceId: ctx.workspaceId, tagId: tg.id, entityType: "file", entityId: fileId })))
      .onConflictDoNothing();
}

// --- Carpetas ---

export const folderInput = z.object({
  name: zRequired(80, "El nombre"),
  parentId: zOptUuid,
  clientId: zOptUuid,
  projectId: zOptUuid,
});

export async function createFolder(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", R);
  const input = folderInput.parse(raw);
  return getDb().transaction(async (t) => {
    let parent: typeof schema.folder.$inferSelect | undefined;
    if (input.parentId) {
      [parent] = await t
        .select()
        .from(schema.folder)
        .where(and(eq(schema.folder.id, input.parentId), scoped(schema.folder, ctx)));
      if (!parent) throw notFound("La carpeta superior");
    }
    await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
    await assertOwned(t, ctx, schema.project, input.projectId, "El proyecto");
    const [row] = await t
      .insert(schema.folder)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        name: input.name.replace(/[/\\]/g, "-"),
        parentId: parent?.id ?? null,
        clientId: parent ? parent.clientId : (input.clientId ?? null),
        projectId: parent ? parent.projectId : (input.projectId ?? null),
      })
      .returning();
    if (!row) throw new Error("No se pudo crear la carpeta");
    await recordEvent(t, ctx, { type: "carpeta.creada", entityType: "folder", entityId: row.id, summary: `Creó la carpeta «${row.name}»` });
    return row;
  });
}

export async function renameFolder(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", R);
  const { name } = z.object({ name: zRequired(80, "El nombre") }).parse(raw);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.folder)
      .set({ name: name.replace(/[/\\]/g, "-") })
      .where(and(eq(schema.folder.id, id), scoped(schema.folder, ctx)))
      .returning();
    if (!row) throw notFound("La carpeta");
    await recordEvent(t, ctx, { type: "carpeta.renombrada", entityType: "folder", entityId: id, summary: `Renombró la carpeta a «${row.name}»` });
    return row;
  });
}

// --- Adjuntos ---

export const attachInput = z.object({ fileId: zUuid, entityType: zRequired(40, "El tipo"), entityId: zUuid });

export async function attachFile(ctx: Ctx, raw: unknown) {
  const input = attachInput.parse(raw);
  return getDb().transaction(async (t) => {
    await assertAttachable(t, ctx, input.entityType, input.entityId);
    const [f] = await t
      .select()
      .from(schema.file)
      .where(and(eq(schema.file.id, input.fileId), scoped(schema.file, ctx)));
    if (!f) throw notFound("El archivo");
    return linkAttachment(t, ctx, f.id, input.entityType, input.entityId, f.name);
  });
}

export async function detachFile(ctx: Ctx, attachmentId: string) {
  zUuid.parse(attachmentId);
  return getDb().transaction(async (t) => {
    const [a] = await t
      .select()
      .from(schema.fileAttachment)
      .where(and(eq(schema.fileAttachment.id, attachmentId), eq(schema.fileAttachment.workspaceId, ctx.workspaceId)));
    if (!a) throw notFound("El adjunto");
    const resource = ATTACHABLE[a.entityType as EntityType] ?? R;
    assertCan(ctx, "update", resource);
    await t.delete(schema.fileAttachment).where(eq(schema.fileAttachment.id, attachmentId));
    const [f] = await t.select({ name: schema.file.name }).from(schema.file).where(eq(schema.file.id, a.fileId));
    await recordEvent(t, ctx, {
      type: "recurso.desadjuntado",
      entityType: a.entityType,
      entityId: a.entityId,
      summary: `Quitó el adjunto «${f?.name ?? "archivo"}»`,
      payload: { fileId: a.fileId },
    });
    return { fileId: a.fileId, entityType: a.entityType, entityId: a.entityId };
  });
}

// --- Kit de marca ---

const HEX = /^#[0-9a-fA-F]{6}$/;
const jsonArray = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return v ?? [];
      if (!v.trim()) return [];
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    },
    z.array(item, { error: "Formato inválido" }),
  );

export const brandKitInput = z.object({
  colors: jsonArray(z.object({ name: z.string().trim().max(40).default(""), hex: z.string().trim().regex(HEX, "Color hex inválido (#RRGGBB)") })).pipe(
    z.array(z.any()).max(24, "Máximo 24 colores"),
  ),
  fonts: jsonArray(z.object({ name: zRequired(80, "La tipografía"), usage: zOptText(80) })).pipe(z.array(z.any()).max(12, "Máximo 12 tipografías")),
  logoFileIds: jsonArray(zUuid).pipe(z.array(z.string()).max(24, "Máximo 24 logos")),
  guidelinesFileId: zOptUuid,
  notesMd: zOptText(20000),
});

export async function saveBrandKit(ctx: Ctx, clientId: string, raw: unknown) {
  assertCan(ctx, "update", R);
  const input = brandKitInput.parse(raw);
  return getDb().transaction(async (t) => {
    await assertOwned(t, ctx, schema.client, clientId, "El cliente");
    const logoIds = [...new Set(input.logoFileIds as string[])];
    if (logoIds.length) {
      const owned = await t
        .select({ id: schema.file.id, kind: schema.file.kind })
        .from(schema.file)
        .where(and(scoped(schema.file, ctx), inArray(schema.file.id, logoIds)));
      if (owned.length !== logoIds.length) throw notFound("Alguno de los logos");
      if (owned.some((f) => f.kind !== "image" && f.kind !== "logo")) throw validation("Los logos tienen que ser imágenes.", { logoFileIds: "Solo imágenes" });
      // los logos del kit quedan marcados como logos del cliente (vista «Logos»)
      await t
        .update(schema.file)
        .set({ kind: "logo", clientId: sql`coalesce(${schema.file.clientId}, ${clientId}::uuid)` })
        .where(and(eq(schema.file.workspaceId, ctx.workspaceId), inArray(schema.file.id, logoIds)));
    }
    await assertOwned(t, ctx, schema.file, input.guidelinesFileId, "El manual");
    const values = {
      colors: (input.colors as { name: string; hex: string }[]).map((c) => ({ name: c.name, hex: c.hex.toUpperCase() })),
      fonts: (input.fonts as { name: string; usage?: string }[]).map((f) => ({ name: f.name, ...(f.usage ? { usage: f.usage } : {}) })),
      logoFileIds: logoIds,
      guidelinesFileId: input.guidelinesFileId ?? null,
      notesMd: input.notesMd ?? null,
    };
    const [existing] = await t
      .select({ id: schema.brandKit.id })
      .from(schema.brandKit)
      .where(and(scoped(schema.brandKit, ctx), eq(schema.brandKit.clientId, clientId)))
      .for("update");
    const [row] = existing
      ? await t.update(schema.brandKit).set(values).where(eq(schema.brandKit.id, existing.id)).returning()
      : await t
          .insert(schema.brandKit)
          .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, clientId, ...values })
          .returning();
    await recordEvent(t, ctx, { type: "kit_marca.actualizado", entityType: "client", entityId: clientId, summary: "Actualizó el kit de marca" });
    return row;
  });
}

// --- Plantillas reutilizables ---

export const TEMPLATE_KINDS = ["document", "snippet", "prompt", "checklist"] as const;
const VAR_RE = /\{\{\s*([\p{L}\p{N}_.-]{1,40})\s*\}\}/gu;
export const extractVars = (body: string) => [...new Set([...body.matchAll(VAR_RE)].map((m) => m[1] ?? ""))].filter(Boolean).slice(0, 50);
export const fillTemplate = (body: string, values: Record<string, string>) => body.replace(VAR_RE, (m, k: string) => (values[k]?.length ? values[k] : m));

export const templateInput = z.object({
  name: zRequired(120, "El nombre"),
  kind: z.enum(TEMPLATE_KINDS).default("document"),
  bodyMd: zRequired(100_000, "El contenido"),
});

export async function createTemplate(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", R);
  const input = templateInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .insert(schema.reusableTemplate)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, ...input, vars: extractVars(input.bodyMd) })
      .returning();
    if (!row) throw new Error("No se pudo crear la plantilla");
    await recordEvent(t, ctx, { type: "plantilla.creada", entityType: "reusable_template", entityId: row.id, summary: `Creó la plantilla «${row.name}»` });
    return row;
  });
}

export async function updateTemplate(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", R);
  const input = templateInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.reusableTemplate)
      .set({ ...input, vars: extractVars(input.bodyMd) })
      .where(and(eq(schema.reusableTemplate.id, id), scoped(schema.reusableTemplate, ctx)))
      .returning();
    if (!row) throw notFound("La plantilla");
    await recordEvent(t, ctx, { type: "plantilla.actualizada", entityType: "reusable_template", entityId: id, summary: `Editó la plantilla «${row.name}»` });
    return row;
  });
}

// --- Descarga ---

/** Resuelve qué blob servir (archivo del workspace, versión o miniatura). */
export async function resolveDownload(ctx: Ctx, id: string, opts: { version?: number; thumb?: boolean } = {}) {
  assertCan(ctx, "read", R);
  if (!zUuid.safeParse(id).success) return null;
  const db = getDb();
  const [f] = await db
    .select()
    .from(schema.file)
    .where(and(eq(schema.file.id, id), scoped(schema.file, ctx)));
  if (!f) return null;
  if (opts.thumb) return f.thumbKey ? { file: f, key: f.thumbKey, mime: "image/webp", size: null as number | null, version: f.currentVersion } : null;
  if (opts.version && opts.version !== f.currentVersion) {
    const [v] = await db
      .select()
      .from(schema.fileVersion)
      .where(and(eq(schema.fileVersion.workspaceId, ctx.workspaceId), eq(schema.fileVersion.fileId, id), eq(schema.fileVersion.version, opts.version)));
    if (!v) return null;
    return { file: f, key: v.storageKey, mime: f.mime, size: v.size, version: v.version };
  }
  return { file: f, key: f.storageKey, mime: f.mime, size: f.size, version: f.currentVersion };
}
