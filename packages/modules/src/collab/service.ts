import { assertCan, type Ctx, notFound, validation, zRequired } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { getDb, schema } from "@agencyos/db";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { scoped } from "../shared/db";
import { ENTITIES, type EntityType, entityHref, isEntityType } from "../shared/entities";

/** Etiquetas (N6), comentarios (N10), enlaces universales "Conectado con" (N5) y vistas guardadas (N11). */

export const TAG_COLORS = ["#8A93A6", "#7C5CFF", "#22D3EE", "#34D399", "#FBBF24", "#F472B6", "#60A5FA", "#FB923C", "#F43F5E"];

// biome-ignore lint/suspicious/noExplicitAny: tabla genérica del registro de entidades
type AnyTable = PgTable & Record<string, any>;

async function assertEntity(ctx: Ctx, type: string, id: string) {
  if (!isEntityType(type)) throw validation("Tipo inválido");
  const t = ENTITIES[type].table as unknown as AnyTable;
  const [row] = await getDb()
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.id, id), eq(t.workspaceId, ctx.workspaceId)));
  if (!row) throw notFound("El elemento");
}

// --- Etiquetas ---
export async function listTags(ctx: Ctx) {
  return getDb().select().from(schema.tag).where(scoped(schema.tag, ctx)).orderBy(asc(schema.tag.name));
}

export async function createTag(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "tag");
  const input = z
    .object({ name: zRequired(40, "El nombre").transform((s) => s.replace(/^#/, "")), color: z.enum(TAG_COLORS as [string, ...string[]]).default("#8A93A6") })
    .parse(raw);
  const existing = (await listTags(ctx)).find((t) => t.name.toLowerCase() === input.name.toLowerCase());
  if (existing) return existing;
  const [row] = await getDb()
    .insert(schema.tag)
    .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, ...input })
    .returning();
  if (!row) throw new Error("No se pudo crear la etiqueta");
  return row;
}

export async function setEntityTags(ctx: Ctx, type: string, id: string, tagIds: string[]) {
  assertCan(ctx, "create", "tag");
  await assertEntity(ctx, type, id);
  const valid = tagIds.length
    ? await getDb()
        .select({ id: schema.tag.id })
        .from(schema.tag)
        .where(and(scoped(schema.tag, ctx), inArray(schema.tag.id, tagIds)))
    : [];
  return getDb().transaction(async (t) => {
    await t
      .delete(schema.tagging)
      .where(and(eq(schema.tagging.workspaceId, ctx.workspaceId), eq(schema.tagging.entityType, type), eq(schema.tagging.entityId, id)));
    if (valid.length) await t.insert(schema.tagging).values(valid.map((v) => ({ workspaceId: ctx.workspaceId, tagId: v.id, entityType: type, entityId: id })));
    return valid.length;
  });
}

export async function tagsFor(ctx: Ctx, type: string, ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; name: string; color: string }[]>();
  const rows = await getDb()
    .select({ entityId: schema.tagging.entityId, id: schema.tag.id, name: schema.tag.name, color: schema.tag.color })
    .from(schema.tagging)
    .innerJoin(schema.tag, eq(schema.tag.id, schema.tagging.tagId))
    .where(
      and(
        eq(schema.tagging.workspaceId, ctx.workspaceId),
        eq(schema.tagging.entityType, type),
        inArray(schema.tagging.entityId, ids),
        isNull(schema.tag.deletedAt),
      ),
    );
  const m = new Map<string, { id: string; name: string; color: string }[]>();
  for (const r of rows) m.set(r.entityId, [...(m.get(r.entityId) ?? []), { id: r.id, name: r.name, color: r.color }]);
  return m;
}

/** Ids de entidades de un tipo que tienen una etiqueta (para filtrar listas). */
export async function idsWithTag(ctx: Ctx, type: string, tagId: string) {
  const rows = await getDb()
    .select({ id: schema.tagging.entityId })
    .from(schema.tagging)
    .where(and(eq(schema.tagging.workspaceId, ctx.workspaceId), eq(schema.tagging.entityType, type), eq(schema.tagging.tagId, tagId)));
  return rows.map((r) => r.id);
}

// --- Comentarios internos ---
export async function listComments(ctx: Ctx, type: string, id: string) {
  return getDb()
    .select({ c: schema.comment, authorName: schema.user.name })
    .from(schema.comment)
    .leftJoin(schema.user, eq(schema.user.id, schema.comment.authorId))
    .where(and(scoped(schema.comment, ctx), eq(schema.comment.entityType, type), eq(schema.comment.entityId, id)))
    .orderBy(asc(schema.comment.createdAt));
}

export async function addComment(ctx: Ctx, type: string, id: string, body: string) {
  assertCan(ctx, "create", "comment");
  const text = zRequired(10000, "El comentario").parse(body);
  await assertEntity(ctx, type, id);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .insert(schema.comment)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, authorId: ctx.userId, entityType: type, entityId: id, bodyMd: text })
      .returning();
    await recordEvent(t, ctx, { type: "comentario.creado", entityType: type, entityId: id, summary: `Comentó: ${text.slice(0, 80)}` });
    return row;
  });
}

export async function deleteComment(ctx: Ctx, commentId: string) {
  assertCan(ctx, "delete", "comment");
  const [row] = await getDb()
    .update(schema.comment)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(schema.comment.id, commentId),
        scoped(schema.comment, ctx),
        ctx.actor.type === "user" && ctx.role !== "owner" ? eq(schema.comment.authorId, ctx.userId ?? "") : undefined,
      ),
    )
    .returning();
  if (!row) throw notFound("El comentario");
  return row;
}

// --- Conectado con (enlaces universales) ---
export type Connection = { linkId: string | null; type: string; id: string; title: string; href: string; kind: string; direction: "out" | "in" | "implicit" };

async function titles(ctx: Ctx, refs: { type: string; id: string }[]) {
  const out = new Map<string, string>();
  const byType = new Map<string, string[]>();
  for (const r of refs) if (isEntityType(r.type)) byType.set(r.type, [...(byType.get(r.type) ?? []), r.id]);
  for (const [type, ids] of byType) {
    const def = ENTITIES[type as EntityType];
    const t = def.table as unknown as AnyTable;
    const rows = await getDb()
      .select({ id: t.id, title: t[def.title] })
      .from(t)
      .where(and(eq(t.workspaceId, ctx.workspaceId), inArray(t.id, ids), isNull(t.deletedAt)));
    for (const r of rows)
      out.set(
        `${type}:${r.id}`,
        String(r.title ?? "")
          .split("\n")[0]
          ?.slice(0, 120) ?? "",
      );
  }
  return out;
}

export async function listConnections(ctx: Ctx, type: string, id: string): Promise<Connection[]> {
  const rows = await getDb()
    .select()
    .from(schema.link)
    .where(
      and(
        eq(schema.link.workspaceId, ctx.workspaceId),
        or(and(eq(schema.link.fromType, type), eq(schema.link.fromId, id)), and(eq(schema.link.toType, type), eq(schema.link.toId, id))),
      ),
    )
    .orderBy(desc(schema.link.createdAt))
    .limit(200);
  const refs = rows.map((l) =>
    l.fromType === type && l.fromId === id ? { type: l.toType, id: l.toId, l, dir: "out" as const } : { type: l.fromType, id: l.fromId, l, dir: "in" as const },
  );
  // relaciones implícitas: proyecto ↔ cliente, tarea → proyecto
  const implicit: { type: string; id: string }[] = [];
  if (type === "project") {
    const [p] = await getDb()
      .select({ clientId: schema.project.clientId })
      .from(schema.project)
      .where(and(eq(schema.project.id, id), eq(schema.project.workspaceId, ctx.workspaceId)));
    if (p?.clientId) implicit.push({ type: "client", id: p.clientId });
  }
  if (type === "task") {
    const [t] = await getDb()
      .select({ projectId: schema.task.projectId })
      .from(schema.task)
      .where(and(eq(schema.task.id, id), eq(schema.task.workspaceId, ctx.workspaceId)));
    if (t?.projectId) implicit.push({ type: "project", id: t.projectId });
  }
  const names = await titles(ctx, [...refs, ...implicit]);
  const seen = new Set<string>();
  const out: Connection[] = [];
  for (const i of implicit) {
    const key = `${i.type}:${i.id}`;
    if (!names.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ linkId: null, type: i.type, id: i.id, title: names.get(key) ?? "", href: entityHref(i.type, i.id), kind: "belongs", direction: "implicit" });
  }
  for (const r of refs) {
    const key = `${r.type}:${r.id}`;
    if (!names.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ linkId: r.l.id, type: r.type, id: r.id, title: names.get(key) ?? "", href: entityHref(r.type, r.id), kind: r.l.kind, direction: r.dir });
  }
  return out;
}

export async function addLink(ctx: Ctx, from: { type: string; id: string }, to: { type: string; id: string }) {
  assertCan(ctx, "create", "link");
  if (from.type === to.type && from.id === to.id) throw validation("No se puede enlazar un elemento consigo mismo");
  await assertEntity(ctx, from.type, from.id);
  await assertEntity(ctx, to.type, to.id);
  const [row] = await getDb()
    .insert(schema.link)
    .values({ workspaceId: ctx.workspaceId, fromType: from.type, fromId: from.id, toType: to.type, toId: to.id, kind: "related", createdBy: ctx.userId })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function removeLink(ctx: Ctx, linkId: string) {
  assertCan(ctx, "create", "link");
  await getDb()
    .delete(schema.link)
    .where(and(eq(schema.link.id, linkId), eq(schema.link.workspaceId, ctx.workspaceId), eq(schema.link.kind, "related")));
}

// --- Vistas guardadas ---
export async function listSavedViews(ctx: Ctx, module: string) {
  if (!ctx.userId) return [];
  return getDb()
    .select()
    .from(schema.savedView)
    .where(and(scoped(schema.savedView, ctx), eq(schema.savedView.userId, ctx.userId), eq(schema.savedView.module, module)))
    .orderBy(asc(schema.savedView.sort), asc(schema.savedView.createdAt));
}

export async function saveView(ctx: Ctx, raw: unknown) {
  if (!ctx.userId) throw validation("Sin usuario");
  const input = z
    .object({
      module: z.enum(["tareas", "proyectos", "clientes", "movimientos", "notas"]),
      name: zRequired(40, "El nombre"),
      query: z
        .string()
        .max(500)
        .regex(/^[^<>"']*$/, "Consulta inválida"),
    })
    .parse(raw);
  const [row] = await getDb()
    .insert(schema.savedView)
    .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, userId: ctx.userId, ...input })
    .returning();
  return row;
}

export async function deleteSavedView(ctx: Ctx, id: string) {
  if (!ctx.userId) return;
  await getDb()
    .delete(schema.savedView)
    .where(and(eq(schema.savedView.id, id), eq(schema.savedView.userId, ctx.userId), eq(schema.savedView.workspaceId, ctx.workspaceId)));
}
