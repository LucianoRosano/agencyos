import { Badge, cn } from "@agencyos/ui";

/** Piezas visuales del SEO Auditor (sin estado; sirven en servidor y cliente). */

export const SEO_ACCENT = "#60A5FA";

const SEV_TONE: Record<string, "danger" | "warning" | "neutral"> = { critical: "danger", high: "warning", medium: "neutral", low: "neutral" };

export function SeverityBadge({ severity, label }: { severity: string; label: string }) {
  return (
    <Badge tone={SEV_TONE[severity] ?? "neutral"}>
      <span aria-hidden className="inline-block size-1.5 rounded-full" style={{ background: SEV_COLOR[severity] ?? "currentColor" }} />
      {label}
    </Badge>
  );
}

export function scoreTone(score: number | null) {
  if (score === null) return "var(--text-faint)";
  if (score >= 90) return "var(--success)";
  if (score >= 50) return "var(--warning)";
  return "var(--danger)";
}

/** Anillo de puntaje 0–100 con el número grande en el centro (docs/07 §4). */
export function ScoreRing({ score, size = 148, label = "de 100" }: { score: number | null; size?: number; label?: string }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const v = score === null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={score === null ? "Sin puntaje" : `Puntaje ${score} de 100`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="7" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={scoreTone(score)} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-mono font-semibold tracking-tight text-text" style={{ fontSize: size * 0.3, lineHeight: 1 }}>
            {score ?? "—"}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">{label}</div>
        </div>
      </div>
    </div>
  );
}

/** Puntaje chico (lista de auditorías, Lighthouse). */
export function ScoreChip({ score, className }: { score: number | null; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-9 min-w-11 items-center justify-center rounded-lg border border-border px-2 font-mono text-[17px] font-semibold", className)}
      style={{ color: scoreTone(score) }}
    >
      {score ?? "—"}
    </span>
  );
}

/** Flecha ▲▼ con el delta (texto + símbolo: nunca solo color). `invert` = menos es mejor (p. ej. cantidad de problemas). */
export function Delta({ value, invert, suffix = "" }: { value: number | null; invert?: boolean; suffix?: string }) {
  if (value === null) return <span className="font-mono text-[12px] text-text-faint">—</span>;
  if (value === 0) return <span className="font-mono text-[12px] text-text-muted">= 0{suffix}</span>;
  const good = invert ? value < 0 : value > 0;
  return (
    <span className={cn("font-mono text-[12px] font-medium whitespace-nowrap", good ? "text-success" : "text-danger")}>
      {value > 0 ? "▲" : "▼"} {value > 0 ? "+" : ""}
      {value}
      {suffix}
      <span className="sr-only">{good ? " (mejora)" : " (empeora)"}</span>
    </span>
  );
}

export function SevCounts({ counts, labels }: { counts: Record<string, number>; labels: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(["critical", "high", "medium", "low"] as const).map((s) => (
        <span
          key={s}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-md border border-border px-1.5 font-mono text-[11px]",
            counts[s] ? "text-text" : "text-text-faint",
          )}
          title={labels[s]}
        >
          <span aria-hidden className="size-1.5 rounded-full" style={{ background: counts[s] ? SEV_COLOR[s] : "var(--surface-3)" }} />
          <span aria-hidden className="text-text-muted">
            {labels[s]?.[0]}
          </span>
          {counts[s] ?? 0}
          <span className="sr-only"> {labels[s]}</span>
        </span>
      ))}
    </div>
  );
}

export const SEV_COLOR: Record<string, string> = { critical: "var(--danger)", high: "var(--warning)", medium: "var(--accent-2)", low: "var(--text-faint)" };
