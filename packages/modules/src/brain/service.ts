import { assertCan, type Ctx } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { z } from "zod";
import { getDb } from "../shared/db";

const finite = z.number().finite().min(-1e7).max(1e7);
export const layoutInput = z.object({
  viewKey: z.string().regex(/^[a-z0-9:+_-]{1,60}$/, "Vista inválida"),
  positions: z.record(z.string().max(80), z.tuple([finite, finite])).refine((p) => Object.keys(p).length <= 20_000, "Demasiados nodos"),
});

/**
 * Guarda las posiciones del layout (ForceAtlas2, calculado en un Web Worker) para no recalcularlo.
 * Es un caché de presentación: no genera actividad.
 */
export async function saveLayout(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "read", "note");
  const input = layoutInput.parse(raw);
  const nodeCount = Object.keys(input.positions).length;
  const [row] = await getDb()
    .insert(schema.graphLayout)
    .values({ workspaceId: ctx.workspaceId, viewKey: input.viewKey, positions: input.positions, nodeCount, computedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.graphLayout.workspaceId, schema.graphLayout.viewKey],
      set: { positions: input.positions, nodeCount, computedAt: new Date() },
    })
    .returning({ viewKey: schema.graphLayout.viewKey, nodeCount: schema.graphLayout.nodeCount });
  return row;
}
