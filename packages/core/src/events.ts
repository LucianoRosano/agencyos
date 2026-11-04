import { type DbOrTx, schema } from "@agencyos/db";
import type { Ctx } from "./context";

export type EventInput = {
  type: string; // p. ej. "tarea.completada"
  entityType: string;
  entityId?: string | null;
  summary: string; // texto de actividad en español
  payload?: Record<string, unknown>;
};

/**
 * Registra un evento de dominio (outbox) y su entrada de actividad visible,
 * en la misma transacción del cambio de estado.
 */
export async function recordEvent(tx: DbOrTx, ctx: Ctx, ev: EventInput): Promise<void> {
  const payload = ev.payload ?? {};
  await tx.insert(schema.domainEvent).values({
    workspaceId: ctx.workspaceId,
    type: ev.type,
    entityType: ev.entityType,
    entityId: ev.entityId ?? null,
    actorType: ctx.actor.type,
    actorId: ctx.actor.id,
    payload,
  });
  await tx.insert(schema.activity).values({
    workspaceId: ctx.workspaceId,
    entityType: ev.entityType,
    entityId: ev.entityId ?? null,
    verb: ev.type,
    summary: ev.summary,
    actorType: ctx.actor.type,
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
    meta: payload,
  });
}

export type AuditInput = {
  action: string;
  targetType?: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
};

/** Registro inmutable de acciones sensibles (docs/08 §9). */
export async function audit(tx: DbOrTx, ctx: Ctx | null, input: AuditInput & { workspaceId?: string; actorId?: string | null }): Promise<void> {
  await tx.insert(schema.auditLog).values({
    workspaceId: ctx?.workspaceId ?? input.workspaceId ?? null,
    actorType: ctx?.actor.type ?? "user",
    actorId: ctx?.actor.id ?? input.actorId ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
    before: (input.before ?? null) as object | null,
    after: (input.after ?? null) as object | null,
  });
}
