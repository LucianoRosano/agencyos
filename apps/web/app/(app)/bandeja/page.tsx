import { formatDateTime, L, label, relativeFromDate } from "@agencyos/core";
import { listPending } from "@agencyos/modules/inbox/service";
import { Badge, Button, Card, EmptyState, PageHeader } from "@agencyos/ui";
import { Inbox, Play } from "lucide-react";
import Link from "next/link";
import { projectOpts, spaceOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";
import { Processor } from "./processor";

export const metadata = { title: "Bandeja" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const [items, spaces, projects] = await Promise.all([listPending(ctx), spaceOpts(ctx), projectOpts(ctx)]);
  const processing = sp.procesar === "1" && items.length > 0;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Capturar · aclarar · decidir"
        title="Bandeja"
        description="Todo lo que capturaste con C, el botón + o desde Claude. Procesalo uno por uno: convertilo, programalo o descartalo."
        accent="#22D3EE"
        actions={items.length && !processing ? <Button asChild variant="primary"><Link href="/bandeja?procesar=1"><Play className="size-4" /> Procesar ({items.length})</Link></Button> : null}
      />
      {processing ? (
        <Processor
          items={items.map((i) => ({ id: i.id, text: i.text, suggestedType: i.suggestedType, source: i.source, spaceId: i.spaceId, createdAt: i.createdAt }))}
          spaces={spaces}
          projects={projects}
          financeEnabled={ctx.workspace.enabledModules.includes("finance")}
        />
      ) : items.length ? (
        <Card className="divide-y divide-border">
          {items.map((i) => (
            <div key={i.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap break-words text-[15px] text-text">{i.text}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-text-muted">
                  {i.suggestedType ? <Badge>{label(L.inboxType, i.suggestedType)}</Badge> : null}
                  <span title={formatDateTime(i.createdAt)}>{relativeFromDate(i.createdAt)}</span>
                  {i.source !== "app" ? <span>· desde {i.source === "mcp" ? "Claude (MCP)" : i.source}</span> : null}
                </p>
              </div>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState icon={<Inbox />} title="Bandeja vacía" description="Capturá ideas, tareas, gastos o links con la tecla C o el botón +. Después los ordenás desde acá." />
      )}
    </div>
  );
}
