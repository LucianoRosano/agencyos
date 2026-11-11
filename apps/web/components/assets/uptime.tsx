import { cn } from "@agencyos/ui";

type Bucket = { hour: string; total: number; fails: number; avgLatency: number | null };

/** Barras SVG por hora (últimas 24 h): alto = latencia, color = estado. Con alternativa textual. */
export function UptimeBars({ hours, className }: { hours: Bucket[]; className?: string }) {
  const max = Math.max(1, ...hours.map((h) => h.avgLatency ?? 0));
  const w = 6;
  const gap = 2;
  const h = 32;
  const withData = hours.filter((b) => b.total > 0);
  const fails = withData.filter((b) => b.fails > 0).length;
  return (
    <figure className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${hours.length * (w + gap)} ${h}`}
        className="h-8 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Estado por hora, últimas 24 horas"
      >
        {hours.map((b, i) => {
          const empty = b.total === 0;
          const allFail = !empty && b.fails === b.total;
          const bh = empty ? 3 : allFail ? h : Math.max(6, ((b.avgLatency ?? 0) / max) * h);
          const color = empty ? "var(--surface-3)" : allFail ? "var(--danger)" : b.fails ? "var(--warning)" : "var(--success)";
          return <rect key={b.hour} x={i * (w + gap)} y={h - bh} width={w} height={bh} rx={1.5} fill={color} opacity={empty ? 1 : 0.85} />;
        })}
      </svg>
      <figcaption className="sr-only">
        {withData.length ? `${withData.length} horas con chequeos, ${fails} con fallas.` : "Todavía sin chequeos en las últimas 24 horas."}
      </figcaption>
    </figure>
  );
}
