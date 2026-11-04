import { dowShort, formatDayMonth, monthName } from "@agencyos/core";
import { cn, EmptyState } from "@agencyos/ui";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { AddOnDayButton } from "./create";
import { days } from "./range";
import { ScrollAnchor } from "./scroll-to";

/** Ítem ya resuelto por el servidor (modules/calendar). */
export type Item = { key: string; source: string; date: string; time: string | null; title: string; subtitle: string | null; href: string; color: string; sourceLabel: string };

const HOUR_H = 44;
const WEEK_HEAD = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

function byDay(items: Item[]) {
  const m = new Map<string, Item[]>();
  for (const it of items) m.set(it.date, [...(m.get(it.date) ?? []), it]);
  return m;
}

/** Chip compacto (grilla del mes / fila de "todo el día"). */
function Chip({ it, className }: { it: Item; className?: string }) {
  return (
    <Link
      href={it.href}
      title={`${it.sourceLabel}: ${it.title}${it.subtitle ? ` · ${it.subtitle}` : ""}`}
      className={cn("flex h-6 min-w-0 items-center gap-1.5 rounded-[5px] bg-surface-2 pr-1.5 text-[12px] text-text hover:bg-surface-3", className)}
    >
      <span aria-hidden className="h-full w-[3px] shrink-0 rounded-l-[5px]" style={{ background: it.color }} />
      {it.time ? <span className="shrink-0 font-mono text-[11px] text-text-muted">{hhmm(it.time)}</span> : null}
      <span className="truncate">{it.title}</span>
    </Link>
  );
}

/** Fila de lista (agenda, celular). */
function Row({ it }: { it: Item }) {
  return (
    <li>
      <Link href={it.href} className="flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] px-2 py-1.5 hover:bg-surface-2">
        {it.time ? <span className="w-12 shrink-0 font-mono text-[13px] text-text-muted">{hhmm(it.time)}</span> : <span className="w-12 shrink-0 font-mono text-[10px] leading-tight text-text-faint">todo el día</span>}
        <span aria-hidden className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: it.color }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-text">{it.title}</span>
          <span className="block truncate text-[12px] text-text-muted">
            {it.sourceLabel}
            {it.subtitle && it.subtitle !== it.sourceLabel ? ` · ${it.subtitle}` : ""}
          </span>
        </span>
      </Link>
    </li>
  );
}

function DayHeader({ date, today }: { date: string; today: string }) {
  const isToday = date === today;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-1.5">
      <p className={cn("font-mono text-[12px] uppercase tracking-[0.16em]", isToday ? "text-text" : "text-text-muted")}>
        {dowShort(date)} {Number(date.slice(8, 10))} {monthName(Number(date.slice(5, 7))).slice(0, 3)}
        {isToday ? <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">HOY</span> : null}
      </p>
      <AddOnDayButton date={date} className="size-11" />
    </div>
  );
}

/** Lista por día (agenda y versiones de celular). `showEmpty` muestra también días sin ítems. */
export function DayList({ dates, items, today, showEmpty, emptyText }: { dates: string[]; items: Item[]; today: string; showEmpty?: boolean; emptyText: string }) {
  const map = byDay(items);
  const visible = showEmpty ? dates : dates.filter((d) => map.has(d));
  if (!visible.length) return <EmptyState icon={<CalendarDays />} title={emptyText} description="Las tareas, entregas, evaluaciones, cobros y vencimientos con fecha aparecen acá." />;
  return (
    <ol className="flex flex-col gap-5">
      {visible.map((d) => (
        <li key={d} aria-label={formatDayMonth(d)}>
          <DayHeader date={d} today={today} />
          {map.get(d)?.length ? (
            <ul className="mt-1 flex flex-col">{map.get(d)?.map((it) => <Row key={it.key} it={it} />)}</ul>
          ) : (
            <p className="px-2 py-2 text-[13px] text-text-faint">Sin fechas.</p>
          )}
        </li>
      ))}
    </ol>
  );
}

export function MonthGrid({ from, to, month, items, today, dayHref }: { from: string; to: string; month: string; items: Item[]; today: string; dayHref: (d: string) => string }) {
  const map = byDay(items);
  const cells = days(from, to);
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEK_HEAD.map((d) => <div key={d} className="px-2.5 py-2 font-mono text-[11px] tracking-[0.16em] text-text-muted">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const list = map.get(d) ?? [];
          const out = d.slice(0, 7) !== month;
          const isToday = d === today;
          return (
            <div key={d} className={cn("group flex min-h-32 min-w-0 flex-col gap-1 border-border p-1.5", i % 7 !== 6 && "border-r", i < cells.length - 7 && "border-b", out && "bg-bg-elevated/60")}>
              <div className="flex items-center justify-between">
                <Link href={dayHref(d)} aria-label={`Ver el ${formatDayMonth(d)}`} className={cn("grid h-7 min-w-7 place-items-center rounded-md px-1 font-mono text-[12px] hover:bg-surface-2", isToday ? "bg-[image:var(--gradient)] text-white" : out ? "text-text-faint" : "text-text-muted")}>
                  {Number(d.slice(8, 10))}
                </Link>
                <AddOnDayButton date={d} className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
              </div>
              {list.slice(0, 3).map((it) => <Chip key={it.key} it={it} />)}
              {list.length > 3 ? <Link href={dayHref(d)} className="px-1 text-[12px] text-text-muted hover:text-text">+{list.length - 3} más</Link> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Lanes simples para ítems con hora en un mismo día (duración asumida: 1 h). */
function layout(list: Item[]) {
  const timed = list.filter((i) => i.time).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const ends: number[] = [];
  const placed = timed.map((it) => {
    const [h, m] = (it.time ?? "00:00").split(":").map(Number) as [number, number];
    const start = h * 60 + m;
    let lane = ends.findIndex((e) => e <= start);
    if (lane === -1) {
      lane = ends.length;
      ends.push(0);
    }
    ends[lane] = start + 60;
    return { it, start, lane };
  });
  return { placed, lanes: Math.max(1, ends.length) };
}

/** Grilla de 24 h (semana o día), lunes primero. */
export function TimeGrid({ dates, items, today, dayHref }: { dates: string[]; items: Item[]; today: string; dayHref: (d: string) => string }) {
  const map = byDay(items);
  const cols = dates.length;
  const tpl = { gridTemplateColumns: `52px repeat(${cols}, minmax(0, 1fr))` };
  const anyAllDay = dates.some((d) => (map.get(d) ?? []).some((i) => !i.time));
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      <div className="grid border-b border-border" style={tpl}>
        <div />
        {dates.map((d) => (
          <div key={d} className="flex items-center justify-between gap-1 border-l border-border px-2 py-1.5">
            <Link href={dayHref(d)} className={cn("font-mono text-[12px] tracking-[0.12em]", d === today ? "text-text" : "text-text-muted")}>
              {dowShort(d)} <span className={cn("ml-1 rounded px-1", d === today && "bg-[image:var(--gradient)] text-white")}>{Number(d.slice(8, 10))}</span>
            </Link>
            <AddOnDayButton date={d} className="size-7" />
          </div>
        ))}
      </div>
      {anyAllDay ? (
        <div className="grid border-b border-border" style={tpl}>
          <div className="px-1.5 py-1.5 text-right font-mono text-[10px] leading-tight text-text-faint">todo el día</div>
          {dates.map((d) => (
            <div key={d} className="flex min-w-0 flex-col gap-1 border-l border-border p-1">
              {(map.get(d) ?? []).filter((i) => !i.time).map((it) => <Chip key={it.key} it={it} />)}
            </div>
          ))}
        </div>
      ) : null}
      <div data-scroller className="max-h-[60dvh] overflow-y-auto md:max-h-[620px]">
        <ScrollAnchor offset={7 * HOUR_H - 12} />
        <div className="relative grid" style={{ ...tpl, height: 24 * HOUR_H }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-text-faint" style={{ top: h * HOUR_H }}>
                {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          {dates.map((d) => {
            const { placed, lanes } = layout(map.get(d) ?? []);
            return (
              <div key={d} className={cn("relative border-l border-border", d === today && "bg-accent-soft/40")}>
                {Array.from({ length: 24 }, (_, h) => <div key={h} className="border-b border-border/60" style={{ height: HOUR_H }} />)}
                {placed.map(({ it, start, lane }) => (
                  <Link
                    key={it.key}
                    href={it.href}
                    title={`${it.sourceLabel}: ${it.title}`}
                    className="absolute overflow-hidden rounded-md border border-border bg-surface-2 px-1.5 py-1 text-[12px] leading-tight text-text hover:bg-surface-3"
                    style={{ top: (start / 60) * HOUR_H + 1, height: HOUR_H - 2, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`, borderLeft: `3px solid ${it.color}` }}
                  >
                    <span className="block font-mono text-[10px] text-text-muted">{hhmm(it.time)}</span>
                    <span className="block truncate">{it.title}</span>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
