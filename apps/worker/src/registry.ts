import { automationsTick } from "@agencyos/modules/automations/jobs";
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
  { name: "automations-tick", cron: "* * * * *", run: () => automationsTick(), quiet: true },
];
