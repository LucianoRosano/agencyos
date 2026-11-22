import { Badge } from "@agencyos/ui";

/** Acento del módulo (docs/07 §2). */
export const AUTO_ACCENT = "#7A6A55";
/** Texto con el acento (taupe), legible en claro y oscuro (AA). */
export const AUTO_TEXT = "text-[#6b5c48] dark:text-[#c9b79e]";

const RUN_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "danger" | "warning" | "info" }> = {
  running: { label: "En curso", tone: "neutral" },
  succeeded: { label: "Correcta", tone: "success" },
  failed: { label: "Falló", tone: "danger" },
  skipped: { label: "Omitida", tone: "neutral" },
  waiting: { label: "Esperando", tone: "warning" },
  waiting_approval: { label: "Esperando aprobación", tone: "warning" },
};

export function RunStatusBadge({ status }: { status: string }) {
  const s = RUN_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function RuleStateBadge({ active, testMode }: { active: boolean; testMode: boolean }) {
  if (!active) return <Badge tone="neutral">Pausada</Badge>;
  if (testMode) return <Badge tone="warning">Modo prueba</Badge>;
  return <Badge tone="success">Activa</Badge>;
}
