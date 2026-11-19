import type { ReactNode } from "react";
import { cn } from "./lib/cn";

/** Tecla o combinación en Geist Mono (ayuda de atajos, barra lateral, botones). Sin JS. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1.5 font-mono text-[11px] text-text-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * Atajo que aparece al pasar el mouse o enfocar con teclado el control padre (que debe tener la clase `group`),
 * al estilo Linear. CSS puro: no suma JS al presupuesto y no lo recorta el scroll de la barra lateral.
 */
export function ShortcutHint({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span aria-hidden className={cn("hidden items-center gap-1 group-hover:flex group-focus-visible:flex", className)}>
      {keys.map((k) => (
        <Kbd key={k} className="h-[18px] min-w-[18px] px-1 text-[10px]">
          {k}
        </Kbd>
      ))}
    </span>
  );
}
