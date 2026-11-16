import { closeDb, connectionOptions } from "@agencyos/db";
import { PgBoss } from "pg-boss";
import { dispatchOutbox } from "./jobs";
import { log } from "./log";
import { JOBS } from "./registry";
import { WorkerRuntime } from "./runtime";

const TZ = "America/Buenos_Aires";
process.env.AGENCYOS_ROLE ??= "worker";

/**
 * Worker (pg-boss). Escala horizontal: se pueden correr N réplicas (docs/SCALING.md §Worker):
 * - pg-boss encola cada ocurrencia de un cron una sola vez aunque haya varios workers;
 * - el lease de runtime.ts evita que dos réplicas corran el mismo job a la vez;
 * - WORKER_CONCURRENCY = jobs simultáneos por cola no exclusiva en este proceso (localConcurrency de pg-boss);
 * - SIGTERM: deja de tomar jobs y espera los que están en curso (WORKER_SHUTDOWN_TIMEOUT_MS, 25 s).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const rt = new WorkerRuntime();
  const { application_name, connectionTimeoutMillis } = connectionOptions("worker");
  const boss = new PgBoss({
    connectionString: url,
    schema: "pgboss",
    application_name: `${application_name}-boss`,
    connectionTimeoutMillis,
    max: Number(process.env.WORKER_BOSS_POOL_MAX ?? 4),
  });
  boss.on("error", (e) => log.error({ err: String(e) }, "pg-boss"));
  await boss.start();
  for (const j of JOBS) {
    await boss.createQueue(j.name, { retryLimit: 5, retryBackoff: true, retryDelay: 30, expireInSeconds: 600 });
    await boss.schedule(j.name, j.cron, null, { tz: TZ });
    await boss.work(j.name, { localConcurrency: j.exclusive === false ? rt.concurrency : 1 }, () => rt.run(j));
  }
  rt.startHeartbeat();
  // Despacho inicial para no esperar el primer minuto (con lease: no pisa a otra réplica).
  const outbox = JOBS.find((j) => j.name === "outbox-dispatch") ?? { name: "outbox-dispatch", cron: "", run: () => dispatchOutbox(), quiet: true };
  void rt.run(outbox).catch(() => undefined);
  log.info({ jobs: JOBS.map((j) => j.name), instance: rt.instanceId, concurrency: rt.concurrency }, "worker iniciado");

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    const timeout = Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS ?? 25_000);
    log.info({ signal, inFlight: rt.inFlight }, "deteniendo worker: esperando jobs en curso");
    const pending = await rt.drain(timeout);
    await boss.stop({ graceful: true, timeout: 5_000 }).catch((e) => log.warn({ err: String(e) }, "pg-boss stop"));
    await rt.cleanup();
    await closeDb();
    log.info({ pending }, pending ? "worker detenido con jobs sin terminar (pg-boss los reintenta)" : "worker detenido");
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

main().catch((e) => {
  log.error({ err: e instanceof Error ? e.message : String(e) }, "worker no pudo iniciar");
  process.exit(1);
});
