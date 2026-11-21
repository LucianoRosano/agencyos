import { cn } from "@agencyos/ui";

/** Isotipo: cuadrado de tinta con el centro en terracota. Logotipo «AGENCYOS» en Inter, con «OS» en el acento. */
export function Isotype({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative inline-grid size-7 shrink-0 place-items-center rounded-[7px] border-[1.5px] border-text", className)}>
      <span className="size-2.5 rounded-[3px] bg-accent" />
    </span>
  );
}

export function Logo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Isotype />
      {compact ? null : (
        <span className="text-[15px] font-semibold tracking-[0.12em] text-text">
          AGENCY<span className="text-accent-text">OS</span>
        </span>
      )}
      <span className="sr-only">AGENCYOS</span>
    </span>
  );
}
