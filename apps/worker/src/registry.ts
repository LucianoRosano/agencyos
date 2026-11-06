import { cleanupOrphanFiles } from "@agencyos/modules/library/jobs";
import { purgeUptimeChecks, runDailyMonitoring, runUptimeChecks } from "@agencyos/modules/monitoring/jobs";
import { dailySeoSchedules, processQueuedAudits } from "@agencyos/modules/seo/jobs";
import { dailyDueDates, dailySummary, dispatchOutbox, purge } from "./jobs";

/**
 * Registro de trabajos del worker. Cada módulo agrega los suyos acá (una línea por job).
 * cron en zona America/Buenos_Aires.
 */
export type Job = { name: string; cron: string; run: () => Promise<unknown>; quiet?: boolean };

export const JOBS: Job[] = [
  { name: "outbox-dispatch", cron: "* * * * *", run: () => dispatchOutbox(), quiet: true },
  { name: "heartbeat", cron: "*/5 * * * *", run: async () => true, quiet: true },
  { name: "daily-due-dates", cron: "5 6 * * *", run: () => dailyDueDates() },
  { name: "daily-summary", cron: "0 8 * * *", run: () => dailySummary() },
  { name: "trash-purge", cron: "30 4 * * *", run: () => purge() },
  // — módulos de la segunda vuelta: agregar debajo —
  { name: "library-orphans", cron: "45 4 * * *", run: () => cleanupOrphanFiles() },
  { name: "monitoring-uptime", cron: "*/5 * * * *", run: () => runUptimeChecks(), quiet: true },
  { name: "monitoring-daily", cron: "15 6 * * *", run: () => runDailyMonitoring() },
  { name: "monitoring-purge", cron: "45 4 * * *", run: () => purgeUptimeChecks(90) },
  // SEO (M07): la cola es la tabla seo_audit (status queued); cada minuto se procesan de a una. Programadas: diario 3:20.
  { name: "seo-audit", cron: "* * * * *", run: () => processQueuedAudits(), quiet: true },
  { name: "seo-schedules", cron: "20 3 * * *", run: () => dailySeoSchedules() },
];
