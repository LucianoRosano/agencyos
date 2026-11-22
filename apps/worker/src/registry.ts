import { processAgentRuns } from "@agencyos/modules/ai/jobs";
import { automationsTick } from "@agencyos/modules/automations/jobs";
import { indexPending } from "@agencyos/modules/brain/knowledge";
import { refreshFxRates } from "@agencyos/modules/fx/service";
import { cleanupOrphanFiles } from "@agencyos/modules/library/jobs";
import { purgeUptimeChecks, runDailyMonitoring, runUptimeChecks } from "@agencyos/modules/monitoring/jobs";
import { reposDailySync, reposExecutePlans } from "@agencyos/modules/repos/jobs";
import { issueDueRetainers } from "@agencyos/modules/retainers/service";
import { dailySeoSchedules, processQueuedAudits } from "@agencyos/modules/seo/jobs";
import { purgeRateLimits } from "@agencyos/modules/shared/rate-limit";
import { generateWeeklyReports } from "@agencyos/modules/shop/report";
import { dailyDueDates, dailySummary, dispatchOutbox, purge } from "./jobs";

/**
 * Registro de trabajos del worker. Cada módulo agrega los suyos acá (una línea por job).
 * cron en zona America/Buenos_Aires.
 */
// - `exclusive` (default true): con varios workers, solo uno lo corre a la vez (lease en job_lease; ver runtime.ts).
// - `leaseMs`: TTL del lease (se renueva mientras corre; vence solo si el proceso muere). Default 5 min.
export type Job = { name: string; cron: string; run: () => Promise<unknown>; quiet?: boolean; exclusive?: boolean; leaseMs?: number };

export const JOBS: Job[] = [
  { name: "outbox-dispatch", cron: "* * * * *", run: () => dispatchOutbox(), quiet: true, leaseMs: 2 * 60_000 },
  { name: "heartbeat", cron: "*/5 * * * *", run: async () => true, quiet: true, exclusive: false },
  { name: "daily-due-dates", cron: "5 6 * * *", run: () => dailyDueDates() },
  { name: "daily-summary", cron: "0 8 * * *", run: () => dailySummary() },
  { name: "trash-purge", cron: "30 4 * * *", run: () => purge() },
  { name: "rate-limit-purge", cron: "40 4 * * *", run: () => purgeRateLimits() },
  // — módulos de la segunda vuelta: agregar debajo —
  // SaaS para comercios: reporte semanal de cada comercio (lunes 7:10).
  { name: "shop-weekly-reports", cron: "10 7 * * 1", run: () => generateWeeklyReports() },
  { name: "retainers-issue", cron: "5 6 * * *", run: () => issueDueRetainers() },
  // Cotización del dólar (DolarAPI, pública y gratis): durante el horario del mercado y una vez a la noche.
  { name: "fx-rates", cron: "20 10,13,16,19,23 * * *", run: () => refreshFxRates() },
  { name: "library-orphans", cron: "45 4 * * *", run: () => cleanupOrphanFiles() },
  { name: "monitoring-uptime", cron: "*/5 * * * *", run: () => runUptimeChecks(), quiet: true },
  { name: "monitoring-daily", cron: "15 6 * * *", run: () => runDailyMonitoring() },
  { name: "monitoring-purge", cron: "45 4 * * *", run: () => purgeUptimeChecks(90) },
  // SEO (M07): la cola es la tabla seo_audit (status queued); cada minuto se procesan de a una. Programadas: diario 3:20.
  { name: "seo-audit", cron: "* * * * *", run: () => processQueuedAudits(), quiet: true },
  { name: "seo-schedules", cron: "20 3 * * *", run: () => dailySeoSchedules() },
  { name: "automations-tick", cron: "* * * * *", run: () => automationsTick(), quiet: true },
  // Cerebro inteligente: indexa notas, documentos, decisiones y conversaciones nuevas o cambiadas.
  { name: "brain-index", cron: "* * * * *", run: () => indexPending({ limit: 40 }), quiet: true, leaseMs: 2 * 60_000 },
  { name: "repos-execute-plans", cron: "* * * * *", run: () => reposExecutePlans(), quiet: true },
  { name: "repos-daily-sync", cron: "0 4 * * *", run: () => reposDailySync() },
  { name: "ai-agent-runs", cron: "* * * * *", run: () => processAgentRuns({ maxMs: 50_000, pollMs: 3_000 }), quiet: true, leaseMs: 2 * 60_000 },
];
