import { cn } from "@agencyos/ui";

/** Isotipo cuadrado con borde cónico Plasma/Ion + "AGENCYOS" en mono espaciado con "OS" en gradiente. */
export function Isotype({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-grid size-7 shrink-0 place-items-center rounded-[8px] p-[2px]", className)}
      style={{ background: "conic-gradient(from 210deg, #7C5CFF, #22D3EE, #7C5CFF)" }}
    >
      <span className="grid size-full place-items-center rounded-[6px] bg-bg">
        <span className="size-2.5 rounded-[3px] bg-[image:var(--gradient)]" />
      </span>
    </span>
  );
}

export function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Isotype />
      {compact ? null : (
        <span className="font-mono text-[14px] font-semibold tracking-[0.32em] text-text">
          AGENCY<span className="text-gradient">OS</span>
        </span>
      )}
      <span className="sr-only">AGENCYOS</span>
    </span>
  );
}
