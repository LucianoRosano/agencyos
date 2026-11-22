"use client";

import { cn } from "@agencyos/ui";
import { Check } from "lucide-react";
import { useState } from "react";

/**
 * Tilde redondo para completar tareas. Al completar (no al cargar la lista): el tilde salta, sale un anillo suave
 * y, en el celular, una vibración cortita. Con movimiento reducido solo cambia el color.
 */
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
  const [burst, setBurst] = useState(0);
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
        if (!done) {
          setBurst((n) => n + 1);
          try {
            navigator.vibrate?.(8);
          } catch {}
        }
        onToggle();
      }}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full border-2 transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-out)] active:scale-90",
        size === "lg" ? "size-8" : "size-6",
        done ? "border-success bg-success text-bg" : "border-border-strong text-transparent hover:border-accent hover:text-accent/40",
      )}
    >
      {burst ? <span key={burst} aria-hidden className="check-ring pointer-events-none absolute -inset-1 rounded-full border-2 border-success" /> : null}
      <Check key={burst} className={cn(size === "lg" ? "size-4" : "size-3.5", burst && done ? "check-pop" : "")} strokeWidth={3} />
    </button>
  );
}
