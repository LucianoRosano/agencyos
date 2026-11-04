import { todayAR } from "@agencyos/core";
import { CALENDAR_SOURCES, type CalendarSource, getCalendarItems, isCalendarSource } from "@agencyos/modules/calendar/queries";
import { getIcalStatus } from "@agencyos/modules/calendar/service";
import { Button, cn, PageHeader } from "@agencyos/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CalendarCreateProvider, NewEventButton } from "@/components/calendar/create";
import { IcalSubscribe } from "@/components/calendar/ical";
import { type CalParams, calHref, days, isISODate, isView, rangeFor, rangeTitle, shift, VIEWS } from "@/components/calendar/range";
import { DayList, type Item, MonthGrid, TimeGrid } from "@/components/calendar/views";
import { projectOpts, spaceOpts } from "@/lib/options";
import { getSelectedSpace } from "@/lib/prefs";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Calendario" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await requireCtx();
  const today = todayAR();
  const p: CalParams = {
    vista: isView(sp.vista) ? sp.vista : "mes",
    fecha: isISODate(sp.fecha) ? sp.fecha : today,
    ocultar: (sp.ocultar ?? "").split(",").filter(isCalendarSource),
  };
  const { from, to } = rangeFor(p.vista, p.fecha);
  const hidden = new Set<string>(p.ocultar);
  const [raw, ical, projects, spaces] = await Promise.all([
    getCalendarItems(ctx, { from, to, spaceId: await getSelectedSpace() }),
    getIcalStatus(ctx),
    projectOpts(ctx),
    spaceOpts(ctx),
  ]);
  const labelOf = new Map<string, string>(CALENDAR_SOURCES.map((s) => [s.key, s.label]));
  const counts = new Map<string, number>();
  for (const it of raw) counts.set(it.source, (counts.get(it.source) ?? 0) + 1);
  const items: Item[] = raw.filter((it) => !hidden.has(it.source)).map((it) => ({ ...it, sourceLabel: labelOf.get(it.source) ?? "" }));
  const dayHref = (d: string) => calHref(p, { vista: "dia", fecha: d });
  const toggle = (s: CalendarSource) => calHref(p, { ocultar: hidden.has(s) ? p.ocultar.filter((x) => x !== s) : [...p.ocultar, s] });
  const month = p.fecha.slice(0, 7);
  const monthDays = days(`${month}-01`, to).filter((d) => d.startsWith(month));

  return (
    <CalendarCreateProvider projects={projects} spaces={spaces} today={today}>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="Calendario"
          title={rangeTitle(p.vista, p.fecha)}
          accent="var(--gradient)"
          actions={
            <>
              <IcalSubscribe active={ical.active} createdAt={ical.createdAt} />
              <NewEventButton date={p.fecha < today && p.vista !== "dia" ? today : p.fecha} />
            </>
          }
        />

        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <nav aria-label="Vista" className="grid grid-cols-4 gap-1 rounded-[var(--radius-control)] border border-border bg-bg-elevated p-1 md:w-auto">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={calHref(p, { vista: v.key })}
                aria-current={p.vista === v.key ? "page" : undefined}
                className={cn(
                  "grid h-9 place-items-center rounded-md px-3 text-sm transition-colors",
                  p.vista === v.key ? "bg-surface-3 text-text" : "text-text-muted hover:text-text",
                )}
              >
                {v.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" aria-label="Anterior">
              <Link href={calHref(p, { fecha: shift(p.vista, p.fecha, -1) })}>
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={calHref(p, { fecha: today })}>Hoy</Link>
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Siguiente">
              <Link href={calHref(p, { fecha: shift(p.vista, p.fecha, 1) })}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

        <ul aria-label="Fuentes" className="mb-5 flex flex-wrap gap-1.5">
          {CALENDAR_SOURCES.map((s) => {
            const on = !hidden.has(s.key);
            return (
              <li key={s.key}>
                <Link
                  href={toggle(s.key)}
                  title={on ? `Ocultar ${s.label.toLowerCase()}` : `Mostrar ${s.label.toLowerCase()}`}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors",
                    on ? "border-border-strong bg-surface text-text" : "border-dashed border-border text-text-faint line-through decoration-text-faint/60",
                  )}
                >
                  <span aria-hidden className={cn("size-2 rounded-full", !on && "opacity-40")} style={{ background: s.color }} />
                  {s.label}
                  <span className="sr-only">{on ? " (visible)" : " (oculto)"}</span>
                  {counts.get(s.key) ? <span className="font-mono text-[11px] text-text-faint">{counts.get(s.key)}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>

        {p.vista === "mes" ? (
          <>
            <div className="hidden md:block">
              <MonthGrid from={from} to={to} month={month} items={items} today={today} dayHref={dayHref} />
            </div>
            <div className="md:hidden">
              <DayList dates={monthDays} items={items.filter((i) => i.date.startsWith(month))} today={today} emptyText="Sin fechas este mes" />
            </div>
          </>
        ) : p.vista === "semana" ? (
          <>
            <div className="hidden md:block">
              <TimeGrid dates={days(from, to)} items={items} today={today} dayHref={dayHref} />
            </div>
            <div className="md:hidden">
              <DayList dates={days(from, to)} items={items} today={today} showEmpty emptyText="Sin fechas esta semana" />
            </div>
          </>
        ) : p.vista === "dia" ? (
          <TimeGrid dates={[p.fecha]} items={items} today={today} dayHref={dayHref} />
        ) : (
          <DayList dates={days(from, to)} items={items} today={today} emptyText="Sin fechas en los próximos 30 días" />
        )}
      </div>
    </CalendarCreateProvider>
  );
}
