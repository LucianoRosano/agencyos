import { randomBytes } from "node:crypto";
import { utimes, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { getPool } from "@agencyos/db";
import { releaseAllLeases, withLease } from "@agencyos/modules/shared/job-lease";
import { log } from "./log";
import type { Job } from "./registry";

/**
 * Ejecución de jobs de un proceso worker (docs/SCALING.md §Worker):
 * - Jobs `exclusive` (por defecto todos los programados): lease en `job_lease` → nunca dos workers a la vez.
 * - Seguimiento de jobs en curso para el apagado ordenado (`drain`).
 * - Latido por instancia en `worker_heartbeat` (+ archivo opcional WORKER_HEARTBEAT_FILE para el healthcheck).
 */
export class WorkerRuntime {
  readonly instanceId = `${hostname()}:${process.pid}:${randomBytes(3).toString("hex")}`;
  private readonly running = new Set<Promise<unknown>>();
  private stopping = false;
  private hbTimer: NodeJS.Timeout | null = null;

  constructor(readonly concurrency = Number(process.env.WORKER_CONCURRENCY ?? 1) || 1) {}

  get inFlight() {
    return this.running.size;
  }

  /** Corre un job respetando el lease. Devuelve `{ skipped: true }` si otro worker lo tiene o si se está apagando. */
  async run(job: Job): Promise<unknown> {
    if (this.stopping) return { skipped: "apagando" };
    const p = this.exec(job);
    this.running.add(p);
    try {
      return await p;
    } finally {
      this.running.delete(p);
    }
  }

  private async exec(job: Job): Promise<unknown> {
    const started = Date.now();
    try {
      if (job.exclusive === false) return await job.run();
      const r = await withLease(`job:${job.name}`, this.instanceId, job.leaseMs ?? 5 * 60_000, job.run);
      if (!r.ran) {
        if (!job.quiet) log.info({ job: job.name }, "job salteado: lo está corriendo otro worker");
        return { skipped: "otro worker" };
      }
      if (!job.quiet) log.info({ job: job.name, ms: Date.now() - started, result: JSON.stringify(r.result) }, "job ok");
      return r.result;
    } catch (e) {
      log.error({ job: job.name, ms: Date.now() - started, err: e instanceof Error ? e.message : String(e) }, "job falló");
      throw e;
    }
  }

  /** Deja de aceptar jobs y espera los que están en curso (hasta `timeoutMs`). Devuelve cuántos quedaron sin terminar. */
  async drain(timeoutMs: number): Promise<number> {
    this.stopping = true;
    if (!this.running.size) return 0;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.allSettled([...this.running]),
      new Promise((r) => {
        timer = setTimeout(r, timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    return this.running.size;
  }

  async heartbeat(): Promise<void> {
    await getPool().query(
      `insert into worker_heartbeat (instance_id, hostname, pid, version, started_at, last_seen_at, running_jobs, concurrency)
       values ($1, $2, $3, $4, now(), now(), $5, $6)
       on conflict (instance_id) do update set last_seen_at = now(), running_jobs = excluded.running_jobs`,
      [this.instanceId, hostname(), process.pid, process.env.APP_VERSION ?? "dev", this.running.size, this.concurrency],
    );
    const file = process.env.WORKER_HEARTBEAT_FILE;
    if (file) {
      const now = new Date();
      await utimes(file, now, now).catch(() => writeFile(file, ""));
    }
  }

  startHeartbeat(intervalMs = 30_000) {
    const beat = () => void this.heartbeat().catch((e) => log.warn({ err: String(e) }, "latido falló"));
    beat();
    this.hbTimer = setInterval(beat, intervalMs);
    this.hbTimer.unref();
  }

  /** Limpia latido y leases propios (al apagar). Borra latidos de instancias muertas hace más de un día. */
  async cleanup(): Promise<void> {
    if (this.hbTimer) clearInterval(this.hbTimer);
    await releaseAllLeases(this.instanceId).catch(() => undefined);
    await getPool()
      .query("delete from worker_heartbeat where instance_id = $1 or last_seen_at < now() - interval '1 day'", [this.instanceId])
      .catch(() => undefined);
  }
}
