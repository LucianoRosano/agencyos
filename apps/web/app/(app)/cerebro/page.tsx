import { getBrainGraph, getLayout } from "@agencyos/modules/brain/queries";
import { BrainView } from "@/components/brain/brain-view";
import { getSelectedSpace } from "@/lib/prefs";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Cerebro" };

export default async function BrainPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const includeTasks = sp.tareas === "1";
  const viewKey = includeTasks ? "main+tasks" : "main";
  const [graph, layout, initialSpace] = await Promise.all([getBrainGraph(ctx, { includeTasks }), getLayout(ctx, viewKey), getSelectedSpace()]);
  const initialNode = sp.nodo && /^[a-z_]+:[0-9a-f-]{36}$/.test(sp.nodo) ? sp.nodo : null;
  return (
    <BrainView
      key={viewKey}
      graph={graph}
      layout={layout}
      includeTasks={includeTasks}
      initialNode={initialNode}
      initialSpace={initialSpace}
      viewKey={viewKey}
    />
  );
}
