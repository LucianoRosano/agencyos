"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { type ReactNode, type PointerEvent as RPointerEvent, useEffect, useRef } from "react";
import { cn } from "./lib/cn";

/** Implementación con Radix de Sheet: se carga recién al primer uso (ver dialog.tsx). */
export function RadixSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  className,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  trigger?: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; t0: number; dy: number } | null>(null);
  // Cada apertura arranca sin el desplazamiento del arrastre anterior.
  useEffect(() => {
    if (open) ref.current?.style.removeProperty("--drag");
  }, [open]);
  // Celular: arrastrar la hoja hacia abajo desde la manija o el título la cierra (como una hoja nativa).
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || window.matchMedia("(min-width: 768px)").matches) return;
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (ref.current) ref.current.style.transition = "none";
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    ref.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onUp = () => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    if (!d || !el) return;
    const speed = d.dy / Math.max(1, performance.now() - d.t0);
    if (d.dy > 110 || (d.dy > 24 && speed > 0.6)) {
      el.style.setProperty("--drag", `${d.dy}px`);
      el.style.transition = "";
      el.style.transform = "";
      onOpenChange(false);
      return;
    }
    el.style.transition = "transform 280ms var(--ease-out)";
    el.style.transform = "";
    setTimeout(() => {
      el.style.transition = "";
    }, 300);
  };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <D.Trigger asChild>{trigger}</D.Trigger> : null}
      <D.Portal>
        <D.Overlay className="ag-overlay fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[3px]" />
        <D.Content
          ref={ref}
          className={cn(
            "ag-sheet fixed z-50 flex max-h-[92dvh] flex-col border border-border bg-surface shadow-[var(--shadow-pop)] will-change-transform focus:outline-none",
            "inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]",
            "md:inset-x-auto md:bottom-auto md:top-[12vh] md:left-1/2 md:w-full md:-translate-x-1/2 md:rounded-[var(--radius-card)] md:pb-0",
            wide ? "md:max-w-2xl" : "md:max-w-lg",
            className,
          )}
        >
          <div className="touch-none md:touch-auto" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-3 md:hidden" aria-hidden />
            <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-2 md:pt-5">
              <div>
                <D.Title className="text-[17px] font-semibold text-text">{title}</D.Title>
                {description ? (
                  <D.Description className="mt-1 text-[13px] text-text-muted">{description}</D.Description>
                ) : (
                  <D.Description className="sr-only">{title}</D.Description>
                )}
              </div>
              <D.Close className="grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text" aria-label="Cerrar">
                <X className="size-4" />
              </D.Close>
            </div>
          </div>
          <div className="overscroll-contain overflow-y-auto px-5 pt-2 pb-5">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const RadixSheetClose = D.Close;
