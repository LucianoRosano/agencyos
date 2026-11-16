import { randomBytes } from "node:crypto";
import { type Ctx, forbidden, zRequired } from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { getDb, schema } from "@agencyos/db";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { DEFAULT_MODULES, seedStructure } from "../setup/service";

/**
 * Varios espacios de trabajo por instalación (p. ej. la agencia y «Personal», o una segunda marca).
 * Cada workspace es un inquilino aislado (todo se filtra por workspace_id). El activo de la sesión se guarda
 * en una cookie y se valida SIEMPRE contra las memberships activas del usuario (resolveActiveMembership).
 */

export const ACTIVE_WORKSPACE_COOKIE = "ag-ws";

const isUuid = (s: string | null | undefined): s is string => Boolean(s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));

async function activeMemberships(userId: string) {
  return getDb()
    .select({ m: schema.membership, w: schema.workspace })
    .from(schema.membership)
    .innerJoin(schema.workspace, eq(schema.workspace.id, schema.membership.workspaceId))
    .where(and(eq(schema.membership.userId, userId), eq(schema.membership.status, "active")))
    .orderBy(asc(schema.membership.createdAt));
}

/**
 * Membership activa con la que trabaja la sesión: la del workspace pedido (cookie) si el usuario tiene acceso
 * activo a él; si no (cookie vieja, manipulada o acceso desactivado), la primera activa. `null` = sin acceso.
 */
export async function resolveActiveMembership(userId: string, preferredWorkspaceId?: string | null) {
  const rows = await activeMemberships(userId);
  return (isUuid(preferredWorkspaceId) ? rows.find((r) => r.w.id === preferredWorkspaceId) : undefined) ?? rows[0] ?? null;
}

/** Workspaces a los que el usuario puede cambiar (selector de la barra lateral). */
export async function listMyWorkspaces(userId: string) {
  return (await activeMemberships(userId)).map((r) => ({ id: r.w.id, name: r.w.name, role: r.m.role }));
}

/** Para cambiar de workspace: solo uno con membership activa del usuario. */
export async function canSwitchTo(userId: string, workspaceId: string): Promise<{ role: string } | null> {
  if (!isUuid(workspaceId)) return null;
  const r = (await activeMemberships(userId)).find((x) => x.w.id === workspaceId);
  return r ? { role: r.m.role } : null;
}

export const workspaceInput = z.object({ name: zRequired(60, "El nombre") });

/** El dueño crea un workspace nuevo: queda como dueño y se siembra con la estructura inicial (seedStructure). */
export async function createWorkspace(ctx: Ctx, raw: unknown) {
  if (ctx.role !== "owner" || ctx.actor.type !== "user" || !ctx.userId) throw forbidden("Solo el dueño puede crear espacios de trabajo.");
  const input = workspaceInput.parse(raw);
  const userId = ctx.userId;
  const db = getDb();
  const [current] = await db.select({ settings: schema.workspace.settings }).from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId));
  const prev = (current?.settings ?? {}) as { agencyName?: string; agencyEmail?: string };
  return db.transaction(async (t) => {
    const [ws] = await t
      .insert(schema.workspace)
      .values({
        name: input.name,
        slug: `ws-${randomBytes(6).toString("hex")}`,
        enabledModules: DEFAULT_MODULES,
        settings: { agencyName: prev.agencyName, agencyEmail: prev.agencyEmail, stalledDays: 14, maxActiveProjects: 8 },
      })
      .returning();
    if (!ws) throw new Error("No se pudo crear el espacio de trabajo");
    await t.insert(schema.membership).values({ workspaceId: ws.id, userId, role: "owner" });
    await seedStructure(t, ws.id, userId);
    const inNew: Ctx = { ...ctx, workspaceId: ws.id };
    await recordEvent(t, inNew, { type: "workspace.creado", entityType: "workspace", entityId: ws.id, summary: `Creó el espacio de trabajo «${ws.name}»` });
    await audit(t, ctx, { action: "workspace.created", targetType: "workspace", targetId: ws.id, after: { name: ws.name } });
    return ws;
  });
}
