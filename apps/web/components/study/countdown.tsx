import { cn } from "@agencyos/ui";
import { daysUntil } from "./shared";

/** Cuenta regresiva grande en amarillo Facultad (como el bloque FACULTAD de la vista de referencia). */
export function Countdown({ date, today, className }: { date: string; today?: string; className?: string }) {
  const n = daysUntil(date, today);
  if (n <= 0) {
    return (
      <p className={cn("shrink-0 font-mono text-[44px] leading-none font-medium text-warning", className)} aria-label={n === 0 ? "Es hoy" : "Ya pasó"}>
        {n === 0 ? "hoy" : "—"}
      </p>
    );
  }
  return (
    <p className={cn("flex shrink-0 items-baseline gap-1.5", className)}>
      <span className="font-mono text-[56px] leading-none font-medium tracking-tight text-warning tabular-nums md:text-[64px]">{n}</span>{" "}
      <span className="text-[20px] text-text-muted">{n === 1 ? "día" : "días"}</span>
    </p>
  );
}
