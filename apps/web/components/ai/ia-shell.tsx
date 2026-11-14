import { formatDateTime, L, label } from "@agencyos/core";
import { formatUsd, MODEL_PRICES } from "@agencyos/modules/ai/pricing";
import { Badge, PageHeader, Tabs } from "@agencyos/ui";
import type { ReactNode } from "react";

export const IA_ACCENT = "var(--gradient)";

export const modelOptions = () => Object.entries(MODEL_PRICES).map(([value, m]) => ({ value, label: m.label }));

export function IaHeader({
  active,
  actions,
  description,
}: {
  active?: "resumen" | "ejecuciones" | "configuracion";
  actions?: ReactNode;
  description?: string;
}) {
  return (
    <>
      <PageHeader
        eyebrow="AI Command Center"
        title="IA"
        description={description ?? "Agentes internos que trabajan con tus datos, con topes de gasto, trazas y aprobación humana."}
        accent={IA_ACCENT}
        actions={actions}
      />
      {active ? (
        <Tabs
          active={active}
          items={[
            { key: "resumen", label: "Agentes", href: "/ia" },
            { key: "ejecuciones", label: "Ejecuciones", href: "/ia/ejecuciones" },
            { key: "configuracion", label: "Configuración", href: "/ia/configuracion" },
          ]}
        />
      ) : null}
    </>
  );
}

const TONE: Record<string, "neutral" | "accent" | "info" | "success" | "warning" | "danger"> = {
  queued: "neutral",
  running: "info",
  waiting_approval: "warning",
  succeeded: "success",
  failed: "danger",
  cancelled: "neutral",
  budget_exceeded: "warning",
};

export function RunStatus({ status }: { status: string }) {
  return <Badge tone={TONE[status] ?? "neutral"}>{label(L.agentRunStatus, status)}</Badge>;
}

export function duration(run: { startedAt: Date; finishedAt: Date | null; status: string }) {
  if (!run.finishedAt) return run.status === "running" ? "en curso" : "—";
  const s = Math.max(0, Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

type RunLite = {
  id: string;
  agentKey: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  costUsd: string;
  input: unknown;
};

/** Lista de ejecuciones: filas en desktop, tarjetas apiladas en el celular (sin tabla, sin scroll horizontal). */
export function RunList({ runs, names }: { runs: RunLite[]; names: Record<string, string> }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      {runs.map((r) => {
        const input = (r.input ?? {}) as { request?: string; entityTitle?: string | null };
        return (
          <li key={r.id}>
            <a
              href={`/ia/ejecuciones/${r.id}`}
              className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-2 md:grid-cols-[9rem_minmax(0,1fr)_8.5rem_9.5rem_7.5rem]"
            >
              <span className="truncate text-[13px] font-medium text-text">{names[r.agentKey] ?? r.agentKey}</span>
              <span className="justify-self-end md:order-last md:justify-self-start">
                <RunStatus status={r.status} />
              </span>
              <span className="col-span-2 truncate text-[13px] text-text-muted md:col-span-1">
                {input.entityTitle ? <span className="text-text">{input.entityTitle} · </span> : null}
                {input.request ?? ""}
              </span>
              <span className="font-mono text-[12px] tabular-nums text-text-faint md:text-text-muted">{formatDateTime(r.startedAt)}</span>
              <span className="justify-self-end font-mono text-[12px] tabular-nums text-text-muted md:justify-self-start">
                {formatUsd(r.costUsd)} · {duration(r)}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
