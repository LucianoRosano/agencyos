import { type Ctx, can, DomainError, formatDateTime, zOptDate, zOptTime } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { and, desc, eq, gt, inArray, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { capture } from "../inbox/service";
import { createNote, updateNote } from "../notes/service";
import { projectScope, scoped } from "../shared/db";
import { createTask, setTaskStatus, updateTask } from "../tasks/service";
import type { OfflineSnapshot, PushResult } from "./types";

/**
 * Modo sin conexión (ADR 0013). El dispositivo guarda una copia de lo de uso diario (tareas, Bandeja, notas,
 * proyectos y clientes) y una cola de cambios. `pullSnapshot` entrega la copia (completa o lo cambiado desde
 * `since`) y `applyMutations` aplica la cola: cada cambio una sola vez (sync_mutation), por los services de
 * siempre (permisos, validación, actividad), y con reglas de conflicto explícitas.
 */

export const NOTE_BODY_LIMIT = 200_000;
const DONE_DAYS = 14;
const LIMITS = { tasks: 3000, notes: 400, inbox: 500, projects: 1000, clients: 3000 };

const iso = (d: Date) => d.toISOString();

export async function pullSnapshot(ctx: Ctx, opts: { since?: string | null } = {}): Promise<OfflineSnapshot> {
  const db = getDb();
  const serverTime = new Date();
  const sinceDate = opts.since && !Number.isNaN(Date.parse(opts.since)) ? new Date(opts.since) : null;
  const full = !sinceDate;
  const changed = <T extends { updatedAt: never }>(col: T["updatedAt"]) => (sinceDate ? gt(col, sinceDate) : undefined);
  const canNotes = can(ctx, "read", "note");
  const canCrm = can(ctx, "read", "crm");
  const canInbox = can(ctx, "read", "inbox");

  const taskWhere = and(
    scoped(schema.task, ctx),
    projectScope(ctx, schema.task.projectId),
    full
      ? or(inArray(schema.task.status, ["todo", "doing", "waiting"]), sql`${schema.task.updatedAt} > now() - make_interval(days => ${DONE_DAYS})`)
      : changed(schema.task.updatedAt as never),
  );
  const [tasks, notes, inbox, projects, clients, spaces] = await Promise.all([
    db
      .select({
        id: schema.task.id,
        title: schema.task.title,
        status: schema.task.status,
        priority: schema.task.priority,
        dueDate: schema.task.dueDate,
        dueTime: schema.task.dueTime,
        projectId: schema.task.projectId,
        spaceId: schema.task.spaceId,
        parentTaskId: schema.task.parentTaskId,
        estimateMinutes: schema.task.estimateMinutes,
        description: sql<string | null>`left(${schema.task.descriptionMd}, 4000)`,
        updatedAt: schema.task.updatedAt,
      })
      .from(schema.task)
      .where(taskWhere)
      .orderBy(desc(schema.task.updatedAt))
      .limit(LIMITS.tasks),
    canNotes
      ? db
          .select({
            id: schema.note.id,
            title: schema.note.title,
            folderPath: schema.note.folderPath,
            pinned: schema.note.pinned,
            size: sql<number>`length(${schema.note.bodyMd})::int`,
            bodyMd: sql<string>`left(${schema.note.bodyMd}, ${NOTE_BODY_LIMIT})`,
            updatedAt: schema.note.updatedAt,
          })
          .from(schema.note)
          .where(and(scoped(schema.note, ctx), changed(schema.note.updatedAt as never)))
          .orderBy(desc(schema.note.updatedAt))
          .limit(LIMITS.notes)
      : Promise.resolve([]),
    canInbox
      ? db
          .select({
            id: schema.inboxItem.id,
            text: schema.inboxItem.text,
            suggestedType: schema.inboxItem.suggestedType,
            createdAt: schema.inboxItem.createdAt,
            updatedAt: schema.inboxItem.updatedAt,
          })
          .from(schema.inboxItem)
          .where(and(scoped(schema.inboxItem, ctx), isNull(schema.inboxItem.processedAt), changed(schema.inboxItem.updatedAt as never)))
          .orderBy(desc(schema.inboxItem.createdAt))
          .limit(LIMITS.inbox)
      : Promise.resolve([]),
    db
      .select({
        id: schema.project.id,
        name: schema.project.name,
        status: schema.project.status,
        clientId: schema.project.clientId,
        nextAction: schema.project.nextAction,
        progress: schema.project.progress,
        targetDate: schema.project.targetDate,
        updatedAt: schema.project.updatedAt,
      })
      .from(schema.project)
      .where(and(scoped(schema.project, ctx), projectScope(ctx), notInArray(schema.project.status, ["archived"]), changed(schema.project.updatedAt as never)))
      .orderBy(desc(schema.project.updatedAt))
      .limit(LIMITS.projects),
    canCrm
      ? db
          .select({
            id: schema.client.id,
            name: schema.client.name,
            status: schema.client.status,
            industry: schema.client.industry,
            city: schema.client.city,
            website: schema.client.website,
            contactName: sql<string | null>`pc.name`,
            phone: sql<string | null>`coalesce(pc.whatsapp, pc.phone)`,
            email: sql<string | null>`pc.email`,
            updatedAt: schema.client.updatedAt,
          })
          .from(schema.client)
          .leftJoin(
            sql`lateral (select ct.name, ct.phone, ct.whatsapp, ct.email from client_contact cc join contact ct on ct.id = cc.contact_id and ct.deleted_at is null where cc.client_id = ${schema.client.id} and cc.workspace_id = ${ctx.workspaceId} order by cc.is_primary desc limit 1) pc`,
            sql`true`,
          )
          .where(and(scoped(schema.client, ctx), changed(schema.client.updatedAt as never)))
          .orderBy(desc(schema.client.updatedAt))
          .limit(LIMITS.clients)
      : Promise.resolve([]),
    db.select({ id: schema.space.id, name: schema.space.name, color: schema.space.color }).from(schema.space).where(scoped(schema.space, ctx)),
  ]);

  const removed: OfflineSnapshot["removed"] = { task: [], note: [], inbox: [], project: [], client: [] };
  if (sinceDate) {
    const gone = <T extends typeof schema.task | typeof schema.note | typeof schema.project | typeof schema.client>(t: T) =>
      db
        .select({ id: t.id })
        .from(t as typeof schema.task)
        .where(
          and(
            eq(t.workspaceId, ctx.workspaceId),
            or(and(isNotNull(t.deletedAt), gt(t.deletedAt, sinceDate)), and(isNotNull(t.archivedAt), gt(t.archivedAt, sinceDate))),
          ),
        )
        .limit(5000);
    const [rt, rn, rp, rc, ri] = await Promise.all([
      gone(schema.task),
      canNotes ? gone(schema.note) : Promise.resolve([]),
      gone(schema.project),
      canCrm ? gone(schema.client) : Promise.resolve([]),
      canInbox
        ? db
            .select({ id: schema.inboxItem.id })
            .from(schema.inboxItem)
            .where(
              and(
                eq(schema.inboxItem.workspaceId, ctx.workspaceId),
                gt(schema.inboxItem.updatedAt, sinceDate),
                or(isNotNull(schema.inboxItem.processedAt), isNotNull(schema.inboxItem.deletedAt)),
              ),
            )
            .limit(5000)
        : Promise.resolve([]),
    ]);
    removed.task = rt.map((r) => r.id);
    removed.note = rn.map((r) => r.id);
    removed.project = rp.map((r) => r.id);
    removed.client = rc.map((r) => r.id);
    removed.inbox = ri.map((r) => r.id);
  }

  return {
    serverTime: iso(serverTime),
    full,
    tasks: tasks.map((t) => ({ ...t, updatedAt: iso(t.updatedAt) })),
    notes: notes.map(({ size, ...n }) => ({ ...n, truncated: size > NOTE_BODY_LIMIT, updatedAt: iso(n.updatedAt) })),
    inbox: inbox.map((i) => ({ ...i, createdAt: iso(i.createdAt), updatedAt: iso(i.updatedAt) })),
    projects: projects.map((p) => ({ ...p, updatedAt: iso(p.updatedAt) })),
    clients: clients.map((c) => ({ ...c, updatedAt: iso(c.updatedAt) })),
    spaces,
    removed,
  };
}

// ---------- Cola de cambios ----------

const uuid = z.string().uuid();
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional();

export const mutationInput = z.discriminatedUnion("type", [
  z.object({
    id: uuid,
    type: z.literal("task.create"),
    entityId: uuid,
    data: z.object({
      title: z.string().trim().min(1).max(300),
      dueDate: zOptDate,
      dueTime: zOptTime,
      priority: opt(z.number().int().min(1).max(4)),
      projectId: opt(uuid),
      spaceId: opt(uuid),
    }),
  }),
  z.object({ id: uuid, type: z.literal("task.status"), entityId: uuid, data: z.object({ status: z.enum(["todo", "doing", "waiting", "done", "cancelled"]) }) }),
  z.object({
    id: uuid,
    type: z.literal("task.update"),
    entityId: uuid,
    data: z.object({
      title: opt(z.string().trim().min(1).max(300)),
      dueDate: opt(
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
      ),
      priority: opt(z.number().int().min(1).max(4)),
    }),
  }),
  z.object({
    id: uuid,
    type: z.literal("inbox.capture"),
    data: z.object({ text: z.string().trim().min(1).max(5000), suggestedType: opt(z.string().max(20)) }),
  }),
  z.object({
    id: uuid,
    type: z.literal("note.create"),
    entityId: uuid,
    data: z.object({ title: z.string().trim().min(1).max(200), bodyMd: z.string().max(NOTE_BODY_LIMIT) }),
  }),
  z.object({
    id: uuid,
    type: z.literal("note.update"),
    entityId: uuid,
    base: z.string().datetime(),
    data: z.object({ bodyMd: z.string().max(NOTE_BODY_LIMIT), title: opt(z.string().trim().min(1).max(200)) }),
  }),
]);
export type Mutation = z.infer<typeof mutationInput>;
export const pushInput = z.object({ mutations: z.array(mutationInput).max(200) });

type Outcome = { status: "applied" | "conflict"; message?: string; entityId?: string };

async function noteTitleFree(ctx: Ctx, title: string) {
  const [hit] = await getDb()
    .select({ id: schema.note.id })
    .from(schema.note)
    .where(and(scoped(schema.note, ctx, { withArchived: true }), sql`lower(${schema.note.title}) = lower(${title})`))
    .limit(1);
  return !hit;
}

async function freeTitle(ctx: Ctx, base: string) {
  if (await noteTitleFree(ctx, base)) return base;
  for (let i = 2; i < 50; i++) {
    const t = `${base.slice(0, 180)} (${i})`;
    if (await noteTitleFree(ctx, t)) return t;
  }
  return `${base.slice(0, 160)} (${Date.now()})`;
}

async function apply(ctx: Ctx, m: Mutation): Promise<Outcome> {
  switch (m.type) {
    case "task.create": {
      const [exists] = await getDb().select({ id: schema.task.id }).from(schema.task).where(eq(schema.task.id, m.entityId));
      if (exists) return { status: "applied", entityId: m.entityId };
      const row = await createTask(ctx, m.data, getDb(), { id: m.entityId });
      return { status: "applied", entityId: row.id };
    }
    case "task.status":
      await setTaskStatus(ctx, m.entityId, m.data.status);
      return { status: "applied", entityId: m.entityId };
    case "task.update": {
      const patch: Record<string, unknown> = {};
      if (m.data.title !== undefined) patch.title = m.data.title;
      if (m.data.dueDate !== undefined) patch.dueDate = m.data.dueDate ?? "";
      if (m.data.priority !== undefined) patch.priority = m.data.priority;
      await updateTask(ctx, m.entityId, patch);
      return { status: "applied", entityId: m.entityId };
    }
    case "inbox.capture": {
      const row = await capture(ctx, { text: m.data.text, suggestedType: m.data.suggestedType }, "app");
      return { status: "applied", entityId: row.id };
    }
    case "note.create": {
      const [exists] = await getDb().select({ id: schema.note.id }).from(schema.note).where(eq(schema.note.id, m.entityId));
      if (exists) return { status: "applied", entityId: m.entityId };
      const title = await freeTitle(ctx, m.data.title);
      const row = await createNote(ctx, { title, bodyMd: m.data.bodyMd }, { id: m.entityId });
      return title === m.data.title
        ? { status: "applied", entityId: row.id }
        : { status: "conflict", entityId: row.id, message: `Ya había una nota «${m.data.title}»: se guardó como «${title}».` };
    }
    case "note.update": {
      const [n] = await getDb()
        .select({ id: schema.note.id, title: schema.note.title, bodyMd: schema.note.bodyMd, updatedAt: schema.note.updatedAt })
        .from(schema.note)
        .where(and(eq(schema.note.id, m.entityId), scoped(schema.note, ctx)));
      const stamp = formatDateTime(new Date());
      if (!n) {
        const title = await freeTitle(ctx, `${m.data.title ?? "Nota"} (recuperada ${stamp})`);
        const row = await createNote(ctx, { title, bodyMd: m.data.bodyMd });
        return { status: "conflict", entityId: row.id, message: `La nota ya no existía: lo que escribiste quedó en «${title}».` };
      }
      if (n.bodyMd === m.data.bodyMd && (m.data.title === undefined || m.data.title === n.title)) return { status: "applied", entityId: n.id };
      // Conflicto: la nota cambió en el servidor después de la copia que se editó sin conexión. No se pisa nada.
      if (n.updatedAt.getTime() > Date.parse(m.base) + 1000) {
        const title = await freeTitle(ctx, `${n.title} (conflicto ${stamp})`);
        const row = await createNote(ctx, { title, bodyMd: m.data.bodyMd });
        return { status: "conflict", entityId: row.id, message: `«${n.title}» cambió en otro dispositivo: tu versión quedó en «${title}».` };
      }
      await updateNote(ctx, n.id, { bodyMd: m.data.bodyMd, ...(m.data.title && m.data.title !== n.title ? { title: m.data.title } : {}) });
      return { status: "applied", entityId: n.id };
    }
  }
}

/**
 * Aplica la cola en orden. Cada cambio queda en sync_mutation: si vuelve a llegar (reintento, otra pestaña) devuelve
 * el resultado guardado sin aplicarlo de nuevo. Un error de dominio (permiso, validación, no existe) lo rechaza; un
 * error inesperado lo deja para reintentar.
 */
export async function applyMutations(ctx: Ctx, raw: unknown): Promise<PushResult[]> {
  if (!ctx.userId) throw new DomainError("FORBIDDEN", "Sin usuario");
  const { mutations } = pushInput.parse(raw);
  const db = getDb();
  const out: PushResult[] = [];
  for (const m of mutations) {
    const entityId = "entityId" in m ? m.entityId : null;
    const [claimed] = await db
      .insert(schema.syncMutation)
      .values({ id: m.id, workspaceId: ctx.workspaceId, userId: ctx.userId, type: m.type, entityId })
      .onConflictDoNothing()
      .returning({ id: schema.syncMutation.id });
    if (!claimed) {
      const [prev] = await db.select().from(schema.syncMutation).where(eq(schema.syncMutation.id, m.id));
      if (!prev || prev.userId !== ctx.userId || prev.workspaceId !== ctx.workspaceId) {
        out.push({ id: m.id, status: "rejected", message: "Cambio inválido" });
        continue;
      }
      const stale = prev.status === "pending" && Date.now() - prev.createdAt.getTime() > 2 * 60_000;
      if (!stale) {
        out.push({
          id: m.id,
          status: prev.status === "pending" ? "retry" : (prev.status as PushResult["status"]),
          message: prev.message ?? undefined,
          duplicate: true,
        });
        continue;
      }
      await db.update(schema.syncMutation).set({ createdAt: new Date() }).where(eq(schema.syncMutation.id, m.id));
    }
    try {
      const r = await apply(ctx, m);
      await db
        .update(schema.syncMutation)
        .set({ status: r.status, message: r.message ?? null, appliedAt: new Date(), entityId: r.entityId ?? entityId })
        .where(eq(schema.syncMutation.id, m.id));
      out.push({ id: m.id, status: r.status, message: r.message, entityId: r.entityId });
    } catch (e) {
      const known = e instanceof DomainError || e instanceof z.ZodError;
      if (known) {
        const message = e instanceof DomainError ? e.message : "Datos inválidos";
        await db.update(schema.syncMutation).set({ status: "rejected", message, appliedAt: new Date() }).where(eq(schema.syncMutation.id, m.id));
        out.push({ id: m.id, status: "rejected", message });
      } else {
        await db.delete(schema.syncMutation).where(eq(schema.syncMutation.id, m.id));
        out.push({ id: m.id, status: "retry", message: "Error temporal: se reintenta" });
      }
    }
  }
  return out;
}
