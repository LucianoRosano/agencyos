import { Badge, cn } from "@agencyos/ui";
import { CircleCheck, CircleDashed, CircleMinus, CircleX } from "lucide-react";

export const REPOS_ACCENT = "#E8EBF2";

export const SCOPE_LABEL: Record<string, string> = {
  prod: "Producto",
  cli: "Cliente",
  int: "Interno",
  tpl: "Plantilla",
  per: "Personal",
  edu: "Facultad",
};

export const PLAN_STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "info" | "success" | "warning" | "danger" }> = {
  draft: { label: "Borrador", tone: "neutral" },
  pending_approval: { label: "Por aprobar", tone: "warning" },
  approved: { label: "Aprobado · en cola", tone: "info" },
  executing: { label: "Ejecutando", tone: "info" },
  done: { label: "Ejecutado", tone: "success" },
  failed: { label: "Con errores", tone: "danger" },
  rejected: { label: "Rechazado", tone: "neutral" },
};

export const ACTION_STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "info" | "success" | "warning" | "danger" }> = {
  pending: { label: "Pendiente", tone: "neutral" },
  done: { label: "Hecha", tone: "success" },
  failed: { label: "Falló", tone: "danger" },
  skipped: { label: "Omitida", tone: "neutral" },
};

export const RISK: Record<string, { label: string; tone: "neutral" | "warning" | "danger" }> = {
  low: { label: "Riesgo bajo", tone: "neutral" },
  medium: { label: "Riesgo medio", tone: "warning" },
  high: { label: "Riesgo alto", tone: "danger" },
};

const bandColor = (score: number | null) =>
  score === null ? "var(--text-faint)" : score >= 90 ? "var(--success)" : score >= 70 ? "var(--warning)" : "var(--danger)";

/** Anillo de salud 0–100 (docs/07 §4): ≥ 90 verde, 70–89 amarillo, < 70 rojo. */
export function HealthRing({ score, size = 40, className }: { score: number | null; size?: number; className?: string }) {
  const r = (size - 5) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, score ?? 0));
  return (
    <span
      role="img"
      aria-label={score === null ? "Salud sin calcular" : `Salud ${score} de 100`}
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={bandColor(score)}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute font-mono text-text" style={{ fontSize: size >= 56 ? 16 : 12 }}>
        {score ?? "—"}
      </span>
    </span>
  );
}

export function CheckIcon({ status }: { status: string }) {
  if (status === "pass") return <CircleCheck className="size-[18px] shrink-0 text-success" aria-label="Cumple" />;
  if (status === "warn") return <CircleDashed className="size-[18px] shrink-0 text-warning" aria-label="Advertencia" />;
  if (status === "fail") return <CircleX className="size-[18px] shrink-0 text-danger" aria-label="No cumple" />;
  return <CircleMinus className="size-[18px] shrink-0 text-text-faint" aria-label="No aplica" />;
}

export function PlanStatusBadge({ status }: { status: string }) {
  const s = PLAN_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Diff legible: líneas con +/− en mono. */
export function DiffView({ lines }: { lines: string[] }) {
  return (
    // Sin scroll interno: la vista previa ya viene recortada (14 líneas) y las líneas largas se cortan.
    <section aria-label="Cambios propuestos" className="mt-2 rounded-[8px] border border-border bg-bg-elevated">
      <pre className="p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words">
        {lines.map((l, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: líneas estáticas
            key={i}
            className={cn("block", l.startsWith("+") ? "text-success" : l.startsWith("-") ? "text-danger" : "text-text-muted")}
          >
            {l}
          </span>
        ))}
      </pre>
    </section>
  );
}
