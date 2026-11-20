import { dowShort, formatDayMonth } from "@agencyos/core";
import type { DayLoad } from "@agencyos/modules/tasks/capacity";
import { cn } from "@agencyos/ui";
import Link from "next/link";

const h = (min: number) => (min % 60 ? `${(min / 60).toFixed(1).replace(".", ",")} h` : `${min / 60} h`);

/** Carga de la semana: horas estimadas por día contra la capacidad (Configuración → Agencia). */
export function WeekLoad({ days }: { days: DayLoad[] }) {
  if (!days.some((d) => d.tasks)) return null;
  const over = days.filter((d) => d.workday && d.minutes > d.capacityMinutes).length;
  return (
    <section aria-label="Carga de la semana" className="mb-5 rounded-[var(--radius-card)] border border-border bg-surface p-3 md:p-4" data-testid="week-load">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-faint">Carga de la semana</h2>
        <p className="text-[12px] text-text-muted">
          {over ? `${over} día${over === 1 ? "" : "s"} por encima de tu capacidad` : "Dentro de tu capacidad"} ·{" "}
          <Link href="/configuracion/workspace" className="underline underline-offset-2 hover:text-text">
            ajustar horas
          </Link>
        </p>
      </div>
      <ol className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const pct = d.capacityMinutes ? Math.min(100, Math.round((d.minutes / d.capacityMinutes) * 100)) : d.minutes ? 100 : 0;
          const isOver = d.minutes > d.capacityMinutes;
          return (
            <li key={d.date} className={cn("flex min-w-0 flex-col gap-1 rounded-lg px-1.5 py-2 text-center", !d.workday && "bg-surface-2/60")}>
              <span className="font-mono text-[10px] tracking-[0.08em] text-text-muted">{dowShort(d.date)}</span>
              <span className="hidden text-[11px] text-text-muted sm:block">{formatDayMonth(d.date)}</span>
              <span
                className="relative mx-auto h-14 w-3 overflow-hidden rounded-full bg-surface-3"
                role="img"
                aria-label={`${dowShort(d.date)} ${formatDayMonth(d.date)}: ${h(d.minutes)} estimadas de ${h(d.capacityMinutes)}, ${d.tasks} tareas${d.unestimated ? `, ${d.unestimated} sin estimar` : ""}`}
              >
                <span
                  className={cn("absolute inset-x-0 bottom-0 rounded-full", isOver ? "bg-warning" : "bg-[image:var(--gradient)]")}
                  style={{ height: `${pct}%` }}
                />
              </span>
              <span className={cn("font-mono text-[11px] tabular-nums", isOver ? "text-warning" : "text-text-muted")}>{d.minutes ? h(d.minutes) : "—"}</span>
              {d.unestimated ? <span className="text-[10px] text-text-muted">+{d.unestimated} s/e</span> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
