/** Gráficos SVG propios, sin dependencias (docs/03). Siempre con alternativa textual. */
import { cn } from "./lib/cn";

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
  const h = 64;
  return (
    <figure className={cn("w-full", className)}>
      <svg viewBox={`0 0 ${data.length * 40} ${h + 18}`} className="w-full" role="img" aria-label={`${labels[0]} y ${labels[1]} por mes`}>
        {data.map((d, i) => {
          const ha = (d.a / max) * h;
          const hb = (d.b / max) * h;
          const x = i * 40 + 4;
          return (
            <g key={d.label}>
              <rect x={x} y={h - ha} width={15} height={Math.max(ha, d.a > 0 ? 2 : 0)} rx={2} fill="var(--success)" opacity={0.85} />
              <rect x={x + 17} y={h - hb} width={15} height={Math.max(hb, d.b > 0 ? 2 : 0)} rx={2} fill="var(--accent)" opacity={0.75} />
              <text x={x + 16} y={h + 14} textAnchor="middle" className="fill-[var(--text-faint)] font-mono" fontSize={9}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        {data.map((d) => `${d.label}: ${labels[0]} ${d.a}, ${labels[1]} ${d.b}`).join(". ")}
      </figcaption>
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

export function HBars({ data, className, color = "var(--accent)" }: { data: { label: string; value: number; display: string }[]; className?: string; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]">
          <span className="truncate text-text-muted">{d.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </span>
          <span className="font-mono tabular-nums text-text">{d.display}</span>
        </li>
      ))}
    </ul>
  );
}
