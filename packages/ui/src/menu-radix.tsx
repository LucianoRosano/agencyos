"use client";

import { DropdownMenu as M } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "./lib/cn";

/** Implementación con Radix: se carga recién al primer uso del menú (ver menu.tsx). */
export function RadixMenu({
  trigger,
  children,
  align = "end",
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end" | "center";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <M.Root open={open} onOpenChange={onOpenChange}>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-48 rounded-[10px] border border-border bg-surface p-1 shadow-[var(--shadow-pop)] data-[state=open]:animate-[fadeIn_120ms_ease-out]"
        >
          {children}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function RadixMenuItem({
  children,
  onSelect,
  danger,
  icon,
  disabled,
}: {
  children: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <M.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 text-[13px] outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50 [&>svg]:size-4",
        danger ? "text-danger" : "text-text",
      )}
    >
      {icon}
      {children}
    </M.Item>
  );
}

export const RadixMenuSeparator = () => <M.Separator className="my-1 h-px bg-border" />;
export const RadixMenuLabel = ({ children }: { children: ReactNode }) => (
  <M.Label className="px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">{children}</M.Label>
);
