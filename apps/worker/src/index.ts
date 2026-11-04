import { closeDb } from "@agencyos/db";
import { PgBoss } from "pg-boss";
import { dailyDueDates, dailySummary, dispatchOutbox, purge } from "./jobs";
import { log } from "./log";

const TZ = "America/Buenos_Aires";

/** Trabajos del sistema (docs/02 M09 "desde el MVP"). Reintentos exponenciales; idempotentes. */
const JOBS: { name: string; cron: string; run: () => Promise<unknown> }[] = [
  { name: "outbox-dispatch", cron: "* * * * *", run: () => dispatchOutbox() },
  { name: "heartbeat", cron: "*/5 * * * *", run: async () => true },
  { name: "daily-due-dates", cron: "5 6 * * *", run: () => dailyDueDates() },
  { name: "daily-summary", cron: "0 8 * * *", run: () => dailySummary() },
  { name: "trash-purge", cron: "30 4 * * *", run: () => purge() },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const boss = new PgBoss({ connectionString: url, schema: "pgboss" });
  boss.on("error", (e) => log.error({ err: String(e) }, "pg-boss"));
  await boss.start();
  for (const j of JOBS) {
    await boss.createQueue(j.name, { retryLimit: 5, retryBackoff: true, retryDelay: 30, expireInSeconds: 600 });
    await boss.schedule(j.name, j.cron, null, { tz: TZ });
    await boss.work(j.name, async () => {
      const started = Date.now();
      try {
        const result = await j.run();
        if (j.name !== "heartbeat" && j.name !== "outbox-dispatch") log.info({ job: j.name, ms: Date.now() - started, result: JSON.stringify(result) }, "job ok");
        return result;
      } catch (e) {
        log.error({ job: j.name, err: e instanceof Error ? e.message : String(e) }, "job falló");
        throw e;
      }
    });
  }
  // Dispara el despacho apenas arranca para no esperar el primer minuto.
  await dispatchOutbox().catch((e) => log.error({ err: String(e) }, "outbox inicial"));
  log.info({ jobs: JOBS.map((j) => j.name) }, "worker iniciado");

  const stop = async () => {
    log.info({}, "deteniendo worker");
    await boss.stop({ graceful: true, timeout: 20_000 });
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((e) => {
  log.error({ err: e instanceof Error ? e.message : String(e) }, "worker no pudo iniciar");
  process.exit(1);
});
