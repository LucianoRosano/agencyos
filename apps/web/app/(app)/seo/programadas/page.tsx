import { formatDate } from "@agencyos/core";
import { listSchedules, SEO_LABELS, siteOptions } from "@agencyos/modules/seo/queries";
import { Badge, Card, EmptyState } from "@agencyos/ui";
import { CalendarClock } from "lucide-react";
import { SeoHeader } from "@/components/seo/header";
import { NewScheduleSheet, ScheduleActions } from "@/components/seo/seo-ui";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Auditorías programadas · SEO" };

export default async function SchedulesPage() {
  const ctx = await requireCtx();
  const [rows, sites] = await Promise.all([listSchedules(ctx), siteOptions(ctx)]);
  return (
    <div className="mx-auto max-w-6xl">
      <SeoHeader active="programadas" actions={<NewScheduleSheet sites={sites} />} />
      {rows.length ? (
        <ul className="flex flex-col gap-3">
          {rows.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[15px] font-medium text-text">{s.siteName ?? s.host}</span>
                    <Badge tone={s.active ? "accent" : "neutral"}>{s.active ? SEO_LABELS.frequency[s.frequency] : "En pausa"}</Badge>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[12px] text-text-muted">
                    {s.rootUrl} · {Number((s.config as { maxPages?: number }).maxPages ?? 300)} páginas
                    {s.active && s.nextRunOn ? ` · próxima ${formatDate(s.nextRunOn)}` : ""}
                  </p>
                </div>
                <ScheduleActions id={s.id} active={s.active} host={s.host} />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={<CalendarClock />}
            title="No hay auditorías programadas"
            description="Programá una auditoría mensual o semanal (por ejemplo, para los sitios en mantenimiento). Si el puntaje baja 5 puntos o aparecen problemas críticos nuevos, te avisa en la campana."
            action={<NewScheduleSheet sites={sites} />}
          />
        </Card>
      )}
    </div>
  );
}
