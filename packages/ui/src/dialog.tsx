"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "./lib/cn";

/**
 * Modal en desktop, hoja inferior (bottom sheet) en el celular (docs/06 §3).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  className,
  wide,
}: {
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  trigger?: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <D.Trigger asChild>{trigger}</D.Trigger> : null}
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-[fadeIn_150ms_ease-out]" />
        <D.Content
          className={cn(
            "fixed z-50 flex max-h-[92dvh] flex-col border border-border bg-surface shadow-[var(--shadow-pop)] focus:outline-none",
            "inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]",
            "md:inset-x-auto md:bottom-auto md:top-[12vh] md:left-1/2 md:w-full md:-translate-x-1/2 md:rounded-[var(--radius-card)] md:pb-0",
            wide ? "md:max-w-2xl" : "md:max-w-lg",
            "data-[state=open]:animate-[sheetIn_200ms_var(--ease)]",
            className,
          )}
        >
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
          <div className="overflow-y-auto px-5 pt-2 pb-5">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const SheetClose = D.Close;
