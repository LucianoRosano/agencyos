"use client";

import { cn } from "@agencyos/ui";
import { Check } from "lucide-react";

export function TaskCheck({
  done,
  onToggle,
  label,
  size = "md",
  disabled,
}: {
  done: boolean;
  onToggle: () => void;
  label: string;
  size?: "md" | "lg";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-2 transition-all duration-200",
        size === "lg" ? "size-8" : "size-6",
        done ? "border-success bg-success text-bg" : "border-border-strong text-transparent hover:border-accent",
      )}
    >
      <Check className={size === "lg" ? "size-4" : "size-3.5"} strokeWidth={3} />
    </button>
  );
}
