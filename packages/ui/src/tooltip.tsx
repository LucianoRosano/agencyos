"use client";

import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "./lib/cn";

/** Tecla o combinación en Geist Mono (en tooltips, ayuda de atajos y botones). */
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
 * Tooltip accesible (hover y foco de teclado) con el atajo visible, al estilo Linear: «Proyectos  G P».
 * `keys` son las teclas en orden; se muestran como Kbd. No reemplaza al texto visible del control.
 */
export function Tooltip({
  content,
  keys,
  children,
  side = "right",
}: {
  content: ReactNode;
  keys?: string[];
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <T.Provider delayDuration={450} skipDelayDuration={250}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            side={side}
            sideOffset={8}
            className="z-50 flex items-center gap-2 rounded-md border border-border bg-surface-3 px-2.5 py-1.5 text-[12px] text-text shadow-[var(--shadow-pop)] data-[state=delayed-open]:animate-[fadeIn_120ms_ease-out]"
          >
            <span>{content}</span>
            {keys?.length ? (
              <span className="flex items-center gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            ) : null}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
