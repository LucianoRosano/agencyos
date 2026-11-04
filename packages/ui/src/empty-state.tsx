import type { ReactNode } from "react";
import { cn } from "./lib/cn";

/** Estado vacío útil: explica para qué sirve y ofrece una acción. Nunca datos falsos. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-6" : "gap-3 py-12", className)}>
      {icon ? (
        <div
          className={cn("grid place-items-center rounded-xl border border-border bg-surface-2 text-text-muted [&>svg]:size-5", compact ? "size-10" : "size-12")}
        >
          {icon}
        </div>
      ) : null}
      <p className={cn("font-medium text-text", compact ? "text-sm" : "text-[15px]")}>{title}</p>
      {description ? <p className="max-w-sm text-[13px] leading-relaxed text-text-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
