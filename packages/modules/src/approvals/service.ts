import { assertCan, type Ctx, notFound, todayAR, validation } from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, desc, eq } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";

export async function listApprovals(ctx: Ctx, status?: string) {
  const where = [scoped(schema.approval, ctx)];
  if (status) where.push(eq(schema.approval.status, status));
  return getDb()
    .select()
    .from(schema.approval)
    .where(and(...where))
    .orderBy(desc(schema.approval.createdAt))
    .limit(200);
}

/**
 * Aprobar una propuesta de Claude: queda aprobada y se crea una tarea para hoy con el detalle
 * (la ejecución la hace Luciano o Claude con el permiso que corresponda). Rechazar la cierra.
 */
export async function decideApproval(ctx: Ctx, id: string, decision: "approved" | "rejected") {
  assertCan(ctx, "manage", "approval");
  if (ctx.actor.type !== "user") throw validation("Solo una persona puede decidir una aprobación.");
  return getDb().transaction(async (t) => {
    const [a] = await t
      .select()
      .from(schema.approval)
      .where(and(eq(schema.approval.id, id), scoped(schema.approval, ctx)));
    if (!a) throw notFound("La aprobación");
    if (a.status !== "pending") throw validation("Esa propuesta ya fue decidida.");
    let taskId: string | null = null;
    if (decision === "approved") {
      const [space] = await t.select().from(schema.space).where(scoped(schema.space, ctx)).limit(1);
      if (space) {
        const detalle = (a.proposal as { detalle?: string }).detalle ?? "";
        const [task] = await t
          .insert(schema.task)
          .values({
            workspaceId: ctx.workspaceId,
            createdBy: ctx.userId,
            assigneeId: ctx.userId,
            title: `Aplicar: ${a.title}`.slice(0, 300),
            descriptionMd: detalle,
            spaceId: space.id,
            priority: 2,
            dueDate: todayAR(),
          })
          .returning();
        taskId = task?.id ?? null;
      }
    }
    const [row] = await t
      .update(schema.approval)
      .set({ status: decision, decidedBy: ctx.userId, decidedAt: new Date(), executionResult: taskId ? { taskId } : null })
      .where(eq(schema.approval.id, id))
      .returning();
    await recordEvent(t, ctx, {
      type: `aprobacion.${decision === "approved" ? "aprobada" : "rechazada"}`,
      entityType: "approval",
      entityId: id,
      summary: `${decision === "approved" ? "Aprobó" : "Rechazó"} la propuesta «${a.title}»`,
    });
    await audit(t, ctx, { action: `approval.${decision}`, targetType: "approval", targetId: id });
    return row;
  });
}
