"use server";

import { getLayout, getLocalGraph } from "@agencyos/modules/brain/queries";
import { saveLayout } from "@agencyos/modules/brain/service";
import { run } from "@/lib/action";
import { requireCtx } from "@/lib/session";

/** Guarda las posiciones calculadas por ForceAtlas2 (caché de presentación, sin revalidar). */
export const saveLayoutAction = async (viewKey: string, positions: Record<string, [number, number]>) => run((ctx) => saveLayout(ctx, { viewKey, positions }), { revalidate: false });

/** Grafo local (profundidad 1–3) con las posiciones del Cerebro si ya existen. */
export async function localGraphAction(entityType: string, entityId: string, depth: number) {
  const ctx = await requireCtx();
  const d = Math.max(1, Math.min(3, Math.round(depth) || 1));
  const [graph, layout] = await Promise.all([getLocalGraph(ctx, entityType, entityId, d), getLayout(ctx, "main")]);
  const positions: Record<string, [number, number]> = {};
  for (const n of graph.nodes) {
    const p = layout?.positions[n.key];
    if (p) positions[n.key] = p;
  }
  return { graph, positions: Object.keys(positions).length === graph.nodes.length ? positions : null };
}
