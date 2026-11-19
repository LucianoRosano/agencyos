import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { tz } from "./_common";

/**
 * Tablas de operación de la plataforma (no de negocio): sin workspace_id. Migración 0005 (docs/SCALING.md).
 */

/** Rate limiting por ventana deslizante aproximada (dos ventanas fijas ponderadas). Ver modules/shared/rate-limit.ts. */
export const rateLimitBucket = pgTable(
  "rate_limit_bucket",
  {
    key: text("key").notNull(),
    windowStart: tz("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ name: "rate_limit_bucket_pk", columns: [t.key, t.windowStart] })],
);

/** Exclusión mutua entre workers para trabajos programados (un solo worker ejecuta cada job a la vez). */
export const jobLease = pgTable("job_lease", {
  name: text("name").primaryKey(),
  holder: text("holder").notNull(),
  acquiredAt: tz("acquired_at").notNull().defaultNow(),
  expiresAt: tz("expires_at").notNull(),
});

/** Latido de cada proceso worker (para /api/health y /api/metrics). */
export const workerHeartbeat = pgTable("worker_heartbeat", {
  instanceId: text("instance_id").primaryKey(),
  hostname: text("hostname").notNull(),
  pid: integer("pid").notNull(),
  version: text("version"),
  startedAt: tz("started_at").notNull().defaultNow(),
  lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
  runningJobs: integer("running_jobs").notNull().default(0),
  concurrency: integer("concurrency").notNull().default(1),
});
