import { statfs } from "node:fs/promises";
import path from "node:path";
import { getPool } from "@agencyos/db";
import { storageDriver } from "./storage";

/**
 * Chequeos de salud y métricas de la plataforma (docs/OBSERVABILITY.md). Solo servidor.
 * Umbrales configurables: HEALTH_WORKER_MAX_AGE_S (120), HEALTH_OUTBOX_MAX_AGE_S (600), HEALTH_DISK_MIN_FREE_PCT (10).
 */
export type CheckStatus = "ok" | "warn" | "fail" | "skip";
export type HealthReport = {
  status: "ok" | "degraded" | "fail";
  checks: {
    db: { status: CheckStatus; ms?: number };
    worker: { status: CheckStatus; instances: number; lastSeenAgeS: number | null };
    outbox: { status: CheckStatus; pending: number; oldestAgeS: number | null };
    storage: { status: CheckStatus; driver: "disk" | "s3"; freePct?: number };
  };
};

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

async function diskFree(): Promise<{ freeBytes: number; totalBytes: number } | null> {
  if (storageDriver() !== "disk") return null;
  try {
    const s = await statfs(process.env.FILES_DIR ?? path.resolve(process.cwd(), ".data/files"));
    return { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch {
    return null;
  }
}

export async function healthReport(): Promise<HealthReport> {
  const pool = getPool();
  const t = Date.now();
  let dbOk = false;
  let ms: number | undefined;
  let worker: HealthReport["checks"]["worker"] = { status: "fail", instances: 0, lastSeenAgeS: null };
  let outbox: HealthReport["checks"]["outbox"] = { status: "fail", pending: 0, oldestAgeS: null };
  try {
    const { rows } = await pool.query<{ instances: number; age: number | null; pending: number; oldest: number | null }>(
      `select (select count(*)::int from worker_heartbeat where last_seen_at > now() - make_interval(secs => $1)) as instances,
              (select extract(epoch from now() - max(last_seen_at))::int from worker_heartbeat) as age,
              (select count(*)::int from domain_event where dispatched_at is null) as pending,
              (select extract(epoch from now() - min(occurred_at))::int from domain_event where dispatched_at is null) as oldest`,
      [num(process.env.HEALTH_WORKER_MAX_AGE_S, 120)],
    );
    dbOk = true;
    ms = Date.now() - t;
    const r = rows[0];
    const maxWorker = num(process.env.HEALTH_WORKER_MAX_AGE_S, 120);
    worker = {
      status: (r?.instances ?? 0) > 0 ? "ok" : "warn",
      instances: r?.instances ?? 0,
      lastSeenAgeS: r?.age ?? null,
    };
    if (worker.lastSeenAgeS !== null && worker.lastSeenAgeS > maxWorker) worker.status = "warn";
    const oldest = r?.oldest ?? null;
    outbox = {
      status: oldest !== null && oldest > num(process.env.HEALTH_OUTBOX_MAX_AGE_S, 600) ? "warn" : "ok",
      pending: r?.pending ?? 0,
      oldestAgeS: oldest,
    };
  } catch {
    dbOk = false;
  }
  const disk = await diskFree();
  const freePct = disk && disk.totalBytes ? Math.round((disk.freeBytes / disk.totalBytes) * 1000) / 10 : undefined;
  const storage: HealthReport["checks"]["storage"] =
    storageDriver() === "s3"
      ? { status: "skip", driver: "s3" }
      : { status: freePct === undefined ? "warn" : freePct < num(process.env.HEALTH_DISK_MIN_FREE_PCT, 10) ? "warn" : "ok", driver: "disk", freePct };
  const checks = { db: { status: (dbOk ? "ok" : "fail") as CheckStatus, ms }, worker, outbox, storage };
  const status = !dbOk ? "fail" : Object.values(checks).some((c) => c.status === "warn" || c.status === "fail") ? "degraded" : "ok";
  return { status, checks };
}

/** Métricas en formato de exposición de Prometheus (text/plain; version=0.0.4). */
export async function prometheusMetrics(): Promise<string> {
  const out: string[] = [];
  const metric = (name: string, help: string, type: "gauge" | "counter", samples: [Record<string, string> | null, number][]) => {
    out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
    for (const [labels, v] of samples) {
      const l = labels
        ? `{${Object.entries(labels)
            .map(([k, x]) => `${k}="${x.replace(/["\\\n]/g, "_")}"`)
            .join(",")}}`
        : "";
      out.push(`${name}${l} ${Number.isFinite(v) ? v : 0}`);
    }
  };
  const pool = getPool();
  const h = await healthReport();
  metric("agencyos_up", "La instancia web responde.", "gauge", [[null, 1]]);
  metric("agencyos_db_up", "La base de datos responde.", "gauge", [[null, h.checks.db.status === "ok" ? 1 : 0]]);
  metric("agencyos_db_ping_ms", "Latencia de la consulta de salud.", "gauge", [[null, h.checks.db.ms ?? 0]]);
  metric("agencyos_db_pool_connections", "Conexiones del pool de ESTA instancia.", "gauge", [
    [{ state: "total" }, pool.totalCount],
    [{ state: "idle" }, pool.idleCount],
    [{ state: "waiting" }, pool.waitingCount],
  ]);
  metric("agencyos_worker_instances", "Workers con latido reciente.", "gauge", [[null, h.checks.worker.instances]]);
  metric("agencyos_worker_last_seen_age_seconds", "Segundos desde el último latido de un worker.", "gauge", [[null, h.checks.worker.lastSeenAgeS ?? -1]]);
  metric("agencyos_outbox_pending", "Eventos de dominio sin despachar.", "gauge", [[null, h.checks.outbox.pending]]);
  metric("agencyos_outbox_oldest_age_seconds", "Antigüedad del evento pendiente más viejo.", "gauge", [[null, h.checks.outbox.oldestAgeS ?? 0]]);
  const disk = await diskFree();
  if (disk) {
    metric("agencyos_storage_free_bytes", "Espacio libre del almacenamiento local.", "gauge", [[null, disk.freeBytes]]);
    metric("agencyos_storage_total_bytes", "Tamaño del almacenamiento local.", "gauge", [[null, disk.totalBytes]]);
  }
  if (h.checks.db.status === "ok") {
    const db = await pool.query<{ size: string }>("select pg_database_size(current_database())::text as size");
    metric("agencyos_db_size_bytes", "Tamaño de la base.", "gauge", [[null, Number(db.rows[0]?.size ?? 0)]]);
    const conns = await pool.query<{ app: string; state: string; n: number }>(
      `select coalesce(nullif(application_name, ''), 'otro') as app, coalesce(state, 'otro') as state, count(*)::int as n
       from pg_stat_activity where datname = current_database() group by 1, 2`,
    );
    metric(
      "agencyos_db_connections",
      "Conexiones a la base por aplicación y estado (todas las instancias).",
      "gauge",
      conns.rows.map((r) => [{ application: r.app, state: r.state }, r.n]),
    );
    const max = await pool.query<{ v: string }>("select current_setting('max_connections') as v");
    metric("agencyos_db_max_connections", "max_connections de PostgreSQL.", "gauge", [[null, Number(max.rows[0]?.v ?? 0)]]);
    try {
      const jobs = await pool.query<{ name: string; state: string; n: number }>(
        "select name, state::text, count(*)::int as n from pgboss.job where created_on > now() - interval '24 hours' group by 1, 2",
      );
      metric(
        "agencyos_jobs_24h",
        "Jobs de pg-boss creados en las últimas 24 h por nombre y estado.",
        "gauge",
        jobs.rows.map((r) => [{ job: r.name, state: r.state }, r.n]),
      );
    } catch {
      // el worker todavía no creó el esquema pgboss
    }
    const rl = await pool.query<{ rule: string; n: number }>(
      "select split_part(key, ':', 1) as rule, coalesce(sum(count), 0)::int as n from rate_limit_bucket where window_start > now() - interval '1 hour' group by 1",
    );
    metric(
      "agencyos_rate_limit_requests_1h",
      "Pedidos contados por el rate limiting en la última hora, por regla.",
      "gauge",
      rl.rows.map((r) => [{ rule: r.rule }, r.n]),
    );
  }
  const mem = process.memoryUsage();
  metric("agencyos_process_resident_memory_bytes", "Memoria residente del proceso.", "gauge", [[null, mem.rss]]);
  metric("agencyos_process_heap_used_bytes", "Heap de V8 en uso.", "gauge", [[null, mem.heapUsed]]);
  metric("agencyos_process_uptime_seconds", "Segundos desde que arrancó el proceso.", "gauge", [[null, Math.round(process.uptime())]]);
  return `${out.join("\n")}\n`;
}
