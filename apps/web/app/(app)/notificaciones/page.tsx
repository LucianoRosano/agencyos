import { formatDate, relativeFromDate, todayAR, toISODateAR } from "@agencyos/core";
import { listNotifications } from "@agencyos/modules/notifications/service";
import { entityHref } from "@agencyos/modules/shared/entities";
import { Card, cn, EmptyState, PageHeader } from "@agencyos/ui";
import { Bell } from "lucide-react";
import Link from "next/link";
import { requireCtx } from "@/lib/session";
import { MarkAllRead } from "./mark-all";

export const metadata = { title: "Notificaciones" };

export default async function NotificationsPage() {
  const ctx = await requireCtx();
  const items = await listNotifications(ctx);
  const days = [...new Set(items.map((n) => toISODateAR(n.createdAt)))];
  const today = todayAR();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Sistema" title="Notificaciones" accent="#22D3EE" actions={items.some((n) => !n.readAt) ? <MarkAllRead /> : null} />
      {items.length ? (
        days.map((d) => (
          <section key={d} className="mb-5">
            <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">{d === today ? "Hoy" : formatDate(d)}</h2>
            <Card className="divide-y divide-border">
              {items
                .filter((n) => toISODateAR(n.createdAt) === d)
                .map((n) => (
                  <Link
                    key={n.id}
                    href={n.entityType && n.entityId ? entityHref(n.entityType, n.entityId) : "/hoy"}
                    className="flex items-start gap-3 p-4 hover:bg-surface-2"
                  >
                    <span
                      className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")}
                      aria-label={n.readAt ? undefined : "Sin leer"}
                    />
                    <span className="flex-1 text-[14px] text-text">{n.title}</span>
                    <span className="font-mono text-[12px] text-text-faint">{relativeFromDate(n.createdAt)}</span>
                  </Link>
                ))}
            </Card>
          </section>
        ))
      ) : (
        <EmptyState icon={<Bell />} title="Sin notificaciones" description="Acá llegan el resumen diario, los vencimientos y lo que haga Claude." />
      )}
    </div>
  );
}
