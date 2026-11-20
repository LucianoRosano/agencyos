import { formatDayMonth } from "@agencyos/core";
import type { WeekCapacity } from "@agencyos/modules/tasks/capacity";
import { cn } from "@agencyos/ui";
import Link from "next/link";

const h = (min: number) => {
  const v = Math.round(min / 6) / 10; // una decimal
  return `${String(v).replace(".", ",")} h`;
};

/**
 * Capacidad de las próximas semanas: barras apiladas (tareas estimadas + horas de abonos) contra la capacidad.
 * Sin JS en el cliente. Muestra cuánto queda libre por semana para decidir si entra un proyecto nuevo.
 */
export function CapacityAhead({ weeks }: { weeks: WeekCapacity[] }) {
  const committed = (w: WeekCapacity) => w.taskMinutes + w.retainerMinutes;
  const totalFree = weeks.slice(1).reduce((a, w) => a + Math.max(0, w.capacityMinutes - committed(w)), 0);
  const over = weeks.filter((w) => committed(w) > w.capacityMinutes).length;
  const unestimated = weeks.reduce((a, w) => a + w.unestimated, 0);
  return (
    <div data-testid="capacity-ahead">
      <p className="mb-3 text-[13px] text-text-muted">
        {over ? `${over} semana${over === 1 ? "" : "s"} por encima de tu capacidad. ` : ""}
        Libre en las semanas que vienen: <span className="font-mono text-text">{h(totalFree)}</span>
        {unestimated ? ` · ${unestimated} tarea${unestimated === 1 ? "" : "s"} sin estimar` : ""}.
      </p>
      <ol className="flex flex-col gap-2.5">
        {weeks.map((w, i) => {
          const c = committed(w);
          const scale = Math.max(w.capacityMinutes, c, 1);
          const isOver = c > w.capacityMinutes;
          const free = w.capacityMinutes - c;
          return (
            <li key={w.start} className="grid grid-cols-[68px_minmax(0,1fr)_104px] items-center gap-2 text-[13px]">
              <span className="font-mono text-[12px] text-text-muted">{i === 0 ? "Esta sem." : formatDayMonth(w.start)}</span>
              <span
                className="relative h-3 overflow-hidden rounded-full bg-surface-3"
                role="img"
                aria-label={`Semana del ${formatDayMonth(w.start)}: ${h(w.taskMinutes)} en tareas y ${h(w.retainerMinutes)} de abonos, de ${h(w.capacityMinutes)} disponibles`}
              >
                <span className="absolute inset-y-0 left-0 bg-[image:var(--gradient)]" style={{ width: `${(w.taskMinutes / scale) * 100}%` }} />
                <span
                  className="absolute inset-y-0 bg-[var(--accent-2)]"
                  style={{ left: `${(w.taskMinutes / scale) * 100}%`, width: `${(w.retainerMinutes / scale) * 100}%` }}
                />
                {isOver ? <span className="absolute inset-y-0 w-0.5 bg-text" style={{ left: `${(w.capacityMinutes / scale) * 100}%` }} /> : null}
              </span>
              <span className={cn("text-right font-mono text-[12px] tabular-nums", isOver ? "text-warning" : "text-text-muted")}>
                {isOver ? `${h(-free)} de más` : `${h(free)} libres`}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[image:var(--gradient)]" aria-hidden /> Tareas estimadas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[var(--accent-2)]" aria-hidden /> Horas de abonos
        </span>
        <Link href="/configuracion/workspace" className="underline underline-offset-2 hover:text-text">
          Ajustar horas por día
        </Link>
      </p>
    </div>
  );
}
