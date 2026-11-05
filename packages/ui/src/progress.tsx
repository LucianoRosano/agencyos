import { cn } from "./lib/cn";

export function Progress({
  value,
  className,
  tone = "gradient",
  label,
}: {
  value: number;
  className?: string;
  tone?: "gradient" | "warning" | "success";
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const fill = tone === "gradient" ? "bg-[image:var(--gradient)]" : tone === "warning" ? "bg-warning" : "bg-success";
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `Avance ${v}%`}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${v}%` }} />
    </div>
  );
}
