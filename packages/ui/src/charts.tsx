/** Gráficos SVG propios, sin dependencias (docs/03). Siempre con alternativa textual. */
import { cn } from "./lib/cn";

/**
 * Barras pareadas por período (p. ej. ingresos vs. gastos). HTML/CSS en vez de un SVG escalado: las etiquetas quedan
 * siempre en cifras tabulares de 11 px y las barras con ancho máximo fijo, sin importar el ancho del bloque.
 */
export function BarPairs({
  data,
  className,
  labels = ["Ingresos", "Gastos"],
}: {
  data: { label: string; a: number; b: number }[];
  className?: string;
  labels?: [string, string];
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const pct = (v: number) => (v > 0 ? `max(2px, ${(v / max) * 100}%)` : "0");
  return (
    <figure className={cn("w-full", className)}>
      <div
        role="img"
        aria-label={`${labels[0]} y ${labels[1]} por período`}
        className="grid gap-x-1.5"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, data.length)}, minmax(0, 1fr))` }}
      >
        {data.map((d) => (
          <div key={d.label} className="flex min-w-0 flex-col items-center gap-2">
            <div className="flex h-24 w-full items-end justify-center gap-[3px] border-b border-border md:h-28">
              <span className="bar-up block w-full max-w-4 rounded-t-[3px] bg-success/85" style={{ height: pct(d.a) }} />
              <span className="bar-up block w-full max-w-4 rounded-t-[3px] bg-accent/75" style={{ height: pct(d.b) }} />
            </div>
            <span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-text-faint">{d.label}</span>
          </div>
        ))}
      </div>
      <figcaption className="sr-only">{data.map((d) => `${d.label}: ${labels[0]} ${d.a}, ${labels[1]} ${d.b}`).join(". ")}</figcaption>
    </figure>
  );
}

export function Sparkline({ values, className, color = "var(--accent)" }: { values: number[]; className?: string; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const w = 100;
  const h = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-7 w-full", className)} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function HBars({
  data,
  className,
  color = "var(--accent)",
}: {
  data: { label: string; value: number; display: string }[];
  className?: string;
  color?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]">
          <span className="truncate text-text-muted">{d.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-3">
            <span className="bar-in block h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </span>
          <span className="font-mono tabular-nums text-text">{d.display}</span>
        </li>
      ))}
    </ul>
  );
}
