import { formatDateTime, relativeFromDate } from "@agencyos/core";
import { EmptyState } from "@agencyos/ui";
import { Activity, Bot, Cog, User } from "lucide-react";

type Row = { id: string; summary: string; actorType: string; actorName: string | null; occurredAt: Date };

export function ActivityList({ rows, empty = "Sin actividad registrada todavía." }: { rows: Row[]; empty?: string }) {
  if (!rows.length) return <EmptyState compact icon={<Activity />} title={empty} />;
  return (
    <ol className="relative flex flex-col gap-0 border-l border-border pl-5">
      {rows.map((r) => (
        <li key={r.id} className="relative py-2.5">
          <span className="absolute top-3.5 -left-[27px] grid size-3.5 place-items-center rounded-full border border-border bg-surface text-text-faint [&>svg]:size-2.5">
            {r.actorType === "agent" ? <Bot /> : r.actorType === "system" ? <Cog /> : <User />}
          </span>
          <p className="text-[14px] text-text">{r.summary}</p>
          <p className="mt-0.5 font-mono text-[11px] text-text-faint" title={formatDateTime(r.occurredAt)}>
            {r.actorName ?? "Sistema"} · {relativeFromDate(r.occurredAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}
