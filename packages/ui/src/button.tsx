import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "text-white bg-[image:var(--gradient)] hover:brightness-110 shadow-[0_0_24px_-8px_var(--accent)]",
  secondary: "bg-surface-2 text-text border border-border hover:bg-surface-3",
  outline: "bg-transparent text-text border border-border hover:bg-surface-2",
  ghost: "bg-transparent text-text-muted hover:text-text hover:bg-surface-2",
  danger: "bg-danger-soft text-danger border border-danger/30 hover:bg-danger/20",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[15px] gap-2",
  icon: "h-10 w-10 justify-center",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
  loading?: boolean;
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] font-medium select-none",
    "transition-[background-color,filter,opacity,transform] duration-150 active:scale-[0.98]",
    "disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({ variant = "secondary", size = "md", asChild, loading, className, children, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </Comp>
  );
}
