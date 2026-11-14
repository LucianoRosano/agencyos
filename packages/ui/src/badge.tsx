import type { ReactNode } from "react";
import { cn } from "./lib/cn";

type Tone = "neutral" | "accent" | "info" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-text-muted border-border",
  accent: "bg-accent-soft text-accent border-accent/30",
  info: "bg-accent-2/10 text-info-text border-accent-2/30",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

/** Chip con punto de color (entidad vinculada: cliente, proyecto…). */
export function EntityChip({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 text-[12px] text-text-muted",
        className,
      )}
    >
      <Dot color={color} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Píldora de estado del saludo de Hoy. */
export function Pill({ color, children, href }: { color: string; children: ReactNode; href?: string }) {
  const cls =
    "inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-[14px] text-text hover:bg-surface-2 transition-colors";
  const inner = (
    <>
      <Dot color={color} />
      {children}
    </>
  );
  return href ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <span className={cls}>{inner}</span>
  );
}
