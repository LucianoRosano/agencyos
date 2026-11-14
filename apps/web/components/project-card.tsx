import { L, label, relativeFromDate } from "@agencyos/core";
import { cn, Dot, Progress } from "@agencyos/ui";
import { CornerDownRight } from "lucide-react";
import Link from "next/link";

export type ProjectCardData = {
  id: string;
  name: string;
  status: string;
  progress: number;
  nextAction: string | null;
  lastActivityAt: Date;
  clientName?: string | null;
  spaceName?: string | null;
  spaceColor?: string | null;
  stalled?: boolean;
  tags?: { id: string; name: string; color: string }[];
};

/** Tarjeta de proyecto como en la vista de referencia de Hoy (frenados atenuados). */
export function ProjectCard({ p }: { p: ProjectCardData }) {
  const dim = p.stalled || p.status === "paused";
  return (
    <Link
      href={`/proyectos/${p.id}`}
      className={cn(
        "group flex min-h-40 flex-col rounded-[var(--radius-card)] border border-border bg-bg-elevated p-4 transition-colors hover:border-border-strong md:p-5",
        dim && "opacity-55",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[16px] font-medium text-text">{p.name}</h3>
        {p.stalled ? (
          <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-faint">frenado</span>
        ) : p.status !== "in_progress" ? (
          <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-text-faint">
            {label(L.projectStatus, p.status).toLowerCase()}
          </span>
        ) : null}
      </div>
      <p className="mt-1 flex items-center gap-2 text-[13px] text-text-muted">
        <Dot color={p.clientName ? "#22D3EE" : (p.spaceColor ?? "#7C5CFF")} />
        {p.clientName ?? p.spaceName ?? "—"}
      </p>
      {p.tags?.length ? (
        <p className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[12px] text-text-muted">
          {p.tags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1">
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: t.color }} />#{t.name}
            </span>
          ))}
        </p>
      ) : null}
      <Progress value={p.progress} className="mt-4" label={`Avance de ${p.name}`} />
      <p className="mt-3 flex flex-1 items-start gap-2 text-[14px] text-text">
        <CornerDownRight className="mt-0.5 size-4 shrink-0 text-accent" />
        <span className={cn("line-clamp-2", !p.nextAction && "text-text-faint")}>{p.nextAction ?? "Sin siguiente acción"}</span>
      </p>
      <div className="mt-3 flex items-center justify-between font-mono text-[12px] text-text-faint">
        <span>{p.progress}%</span>
        <span>{relativeFromDate(p.lastActivityAt)}</span>
      </div>
    </Link>
  );
}
