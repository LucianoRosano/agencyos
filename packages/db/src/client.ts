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

export function getPool(): pg.Pool {
  if (!globalForDb.__agencyosPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Falta la variable DATABASE_URL");
    globalForDb.__agencyosPool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
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
