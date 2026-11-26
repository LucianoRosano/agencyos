import { addDays, formatDate, formatDateTime, relativeFromDate, todayAR, toISODateAR } from "@agencyos/core";
import { listNotifications, type NotificationView, notificationCounts } from "@agencyos/modules/notifications/service";
import { Card, cn, EmptyState, PageHeader } from "@agencyos/ui";
import { Archive, BellRing, Clock, Inbox, Settings2 } from "lucide-react";
import Link from "next/link";
import { notificationKind } from "@/components/notifications/kind";
import { NotificationActions } from "@/components/notifications/notification-actions";
import { NotificationKeys } from "@/components/notifications/notification-keys";
import { requireCtx } from "@/lib/session";
import { MarkAllRead } from "./mark-all";

export const metadata = { title: "Notificaciones" };

const VIEWS: { key: NotificationView; label: string; icon: React.ReactNode }[] = [
  { key: "sin-leer", label: "Sin leer", icon: <BellRing className="size-4" /> },
  { key: "todas", label: "Todas", icon: <Inbox className="size-4" /> },
  { key: "pospuestas", label: "Pospuestas", icon: <Clock className="size-4" /> },
  { key: "archivadas", label: "Archivadas", icon: <Archive className="size-4" /> },
];

type Item = Awaited<ReturnType<typeof listNotifications>>[number];

/** Agrupa los avisos ya leídos del mismo tipo que llegaron seguidos (3 o más); lo sin leer siempre se ve suelto. */
function bundle(items: Item[]) {
  const out: (Item | { group: true; type: string; items: Item[] })[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev && "group" in prev && prev.type === it.type && it.readAt) prev.items.push(it);
    else if (prev && !("group" in prev) && prev.type === it.type && it.readAt && prev.readAt && it.priority !== "urgent" && prev.priority !== "urgent") {
      out[out.length - 1] = { group: true, type: it.type, items: [prev, it] };
    } else out.push(it);
  }
  return out.flatMap((x) => ("group" in x && x.items.length < 3 ? x.items : [x]));
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const ctx = await requireCtx();
  const counts = await notificationCounts(ctx);
  const sp = await searchParams;
  const view: NotificationView = VIEWS.some((v) => v.key === sp.ver) ? (sp.ver as NotificationView) : counts.unread ? "sin-leer" : "todas";
  const items = await listNotifications(ctx, view);
  const today = todayAR();
  const yesterday = addDays(today, -1);
  const dayOf = (n: Item) => (view === "pospuestas" && n.snoozedUntil ? toISODateAR(n.snoozedUntil) : toISODateAR(n.createdAt));
  const days = [...new Set(items.map(dayOf))];
  const dayLabel = (d: string) => (d === today ? "Hoy" : d === yesterday ? "Ayer" : d === addDays(today, 1) ? "Mañana" : formatDate(d));
  const countOf = (k: NotificationView) =>
    k === "sin-leer" ? counts.unread : k === "pospuestas" ? counts.snoozed : k === "archivadas" ? counts.archived : null;

  const row = (n: Item) => {
    const kind = notificationKind(n.type);
    const unread = !n.readAt && !n.archivedAt;
    return (
      <li key={n.id} className="group relative flex items-start gap-3 px-3 py-3 md:px-4" data-notification>
        <Link href={`/notificaciones/abrir/${n.id}`} className="flex min-w-0 flex-1 items-start gap-3 rounded-md outline-offset-4" data-notification-link>
          <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full [&>svg]:size-[17px]", kind.tone)} aria-hidden>
            {kind.icon}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={cn("text-[15px] leading-snug", unread ? "font-medium text-text" : "text-text-muted")}>
              {unread ? <span className="sr-only">Sin leer: </span> : null}
              {n.priority === "urgent" ? (
                <span className="mr-1.5 rounded bg-danger-soft px-1.5 py-px text-[11px] font-semibold text-danger">Urgente</span>
              ) : null}
              {n.title}
            </span>
            {n.body ? <span className="line-clamp-2 text-[13px] text-text-muted">{n.body}</span> : null}
            <span className="text-[12px] text-text-faint">
              {kind.label} · {view === "pospuestas" && n.snoozedUntil ? `vuelve ${formatDateTime(n.snoozedUntil)}` : relativeFromDate(n.createdAt)}
            </span>
          </span>
        </Link>
        {unread ? <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-hidden /> : null}
        <NotificationActions
          id={n.id}
          title={n.title}
          read={Boolean(n.readAt)}
          archived={Boolean(n.archivedAt)}
          snoozed={Boolean(n.snoozedUntil && n.snoozedUntil > new Date())}
        />
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Sistema"
        title="Notificaciones"
        description="Lo que necesita tu atención. Posponé lo que no es para ahora y archivá lo resuelto."
        actions={
          <>
            {counts.unread ? <MarkAllRead /> : null}
            <Link
              href="/configuracion/notificaciones"
              aria-label="Configurar avisos"
              className="grid size-10 place-items-center rounded-[var(--radius-control)] border border-border text-text-muted hover:bg-surface-2 hover:text-text"
            >
              <Settings2 className="size-4" />
            </Link>
          </>
        }
      />
      <nav aria-label="Vistas" className="no-scrollbar -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
        {VIEWS.map((v) => {
          const c = countOf(v.key);
          return (
            <Link
              key={v.key}
              href={`/notificaciones?ver=${v.key}`}
              aria-current={view === v.key ? "page" : undefined}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[14px]",
                view === v.key ? "border-accent/50 bg-accent-soft text-text" : "border-border text-text-muted hover:text-text",
              )}
            >
              {v.icon}
              {v.label}
              {c ? <span className="font-mono text-[12px] text-text-muted">{c}</span> : null}
            </Link>
          );
        })}
      </nav>
      <NotificationKeys />
      {items.length ? (
        <div className="stagger flex flex-col gap-5">
          {days.map((d) => (
            <section key={d} aria-labelledby={`dia-${d}`}>
              <h2 id={`dia-${d}`} className="mb-2 font-serif text-[17px] font-semibold text-text">
                {dayLabel(d)}
              </h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {bundle(items.filter((n) => dayOf(n) === d)).map((x) =>
                    "group" in x ? (
                      <li key={`g-${x.items[0]?.id}`}>
                        <details className="group/b">
                          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-3 hover:bg-surface-2 md:px-4 [&::-webkit-details-marker]:hidden">
                            <span
                              className={cn("grid size-9 shrink-0 place-items-center rounded-full [&>svg]:size-[17px]", notificationKind(x.type).tone)}
                              aria-hidden
                            >
                              {notificationKind(x.type).icon}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="text-[15px] font-medium text-text">
                                {x.items.length} avisos de {notificationKind(x.type).label.toLowerCase()}
                              </span>
                              <span className="truncate text-[13px] text-text-muted">{x.items.map((i) => i.title).join(" · ")}</span>
                            </span>
                            <span className="text-[13px] text-accent-text group-open/b:hidden">Ver</span>
                            <span className="hidden text-[13px] text-accent-text group-open/b:inline">Ocultar</span>
                          </summary>
                          <ul className="divide-y divide-border border-t border-border bg-surface-2/40">{x.items.map(row)}</ul>
                        </details>
                      </li>
                    ) : (
                      row(x)
                    ),
                  )}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <Card className="p-2">
          <EmptyState
            icon={view === "pospuestas" ? <Clock /> : view === "archivadas" ? <Archive /> : <BellRing />}
            title={
              view === "sin-leer" ? "Estás al día" : view === "pospuestas" ? "Nada pospuesto" : view === "archivadas" ? "Nada archivado" : "Sin avisos todavía"
            }
            description={
              view === "sin-leer"
                ? "No hay nada sin leer. Disfrutalo."
                : "Acá llegan el resumen del día, los vencimientos, lo que hacen tus clientes y lo que necesita el agente."
            }
            action={
              <Link href="/configuracion/notificaciones" className="text-[14px] text-accent-text underline">
                Elegir qué te avisa y cuándo
              </Link>
            }
          />
        </Card>
      )}
    </div>
  );
}
