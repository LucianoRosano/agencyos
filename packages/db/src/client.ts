import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Schema = typeof schema;
export type DB = NodePgDatabase<Schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;

// Fechas tipo `date` se devuelven como string 'YYYY-MM-DD' (sin conversión de zona).
pg.types.setTypeParser(1082, (v) => v);

const globalForDb = globalThis as unknown as { __agencyosPool?: pg.Pool; __agencyosDb?: DB };

/** Rol del proceso: define `application_name` y los timeouts por defecto (docs/SCALING.md §Pool). */
export type ProcessRole = "web" | "worker" | "migrate" | "script";

export function processRole(): ProcessRole {
  const r = process.env.AGENCYOS_ROLE;
  return r === "worker" || r === "migrate" || r === "script" ? r : "web";
}

const DEFAULT_STATEMENT_TIMEOUT: Record<ProcessRole, number> = { web: 15_000, worker: 120_000, migrate: 0, script: 0 };

const intEnv = (name: string, fallback: number) => {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

/**
 * Parámetros de conexión comunes (pool de la app y pg-boss del worker).
 * - `statement_timeout`: corta consultas colgadas (15 s web, 120 s worker; `DB_STATEMENT_TIMEOUT_MS` lo pisa; 0 = sin límite).
 * - `idle_in_transaction_session_timeout`: libera locks de transacciones abandonadas (`DB_IDLE_TX_TIMEOUT_MS`, 60 s).
 * - `application_name`: `agencyos-web` / `agencyos-worker` (visible en `pg_stat_activity`).
 */
export function connectionOptions(role: ProcessRole = processRole()) {
  return {
    application_name: process.env.DB_APPLICATION_NAME || `agencyos-${role}`,
    statement_timeout: intEnv("DB_STATEMENT_TIMEOUT_MS", DEFAULT_STATEMENT_TIMEOUT[role]),
    idle_in_transaction_session_timeout: intEnv("DB_IDLE_TX_TIMEOUT_MS", role === "migrate" || role === "script" ? 0 : 60_000),
    connectionTimeoutMillis: intEnv("DB_CONNECT_TIMEOUT_MS", 10_000),
  };
}

export function getPool(): pg.Pool {
  if (!globalForDb.__agencyosPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta la variable DATABASE_URL");
    globalForDb.__agencyosPool = new pg.Pool({
      connectionString: url,
      max: intEnv("DB_POOL_MAX", 10),
      idleTimeoutMillis: intEnv("DB_POOL_IDLE_MS", 30_000),
      ...connectionOptions(),
    });
  }
  return globalForDb.__agencyosPool;
}

export function getDb(): DB {
  if (!globalForDb.__agencyosDb) {
    globalForDb.__agencyosDb = drizzle(getPool(), { schema });
  }
  return globalForDb.__agencyosDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__agencyosPool?.end();
  globalForDb.__agencyosPool = undefined;
  globalForDb.__agencyosDb = undefined;
}
