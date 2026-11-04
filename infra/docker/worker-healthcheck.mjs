// Healthcheck del contenedor del worker (lo invoca docker-compose).
// 1) Si existe WORKER_HEARTBEAT_FILE, tiene que haberse tocado en los últimos 120 s
//    (contrato opcional: el worker hace `touch` del archivo en cada ciclo).
// 2) La base de datos tiene que responder `select 1` (pg-boss vive en PostgreSQL).
import { statSync } from "node:fs";
import pg from "pg";

const MAX_AGE_MS = 120_000;
const fail = (msg) => {
  console.error(`worker-healthcheck: ${msg}`);
  process.exit(1);
};

const hb = process.env.WORKER_HEARTBEAT_FILE;
if (hb) {
  try {
    const age = Date.now() - statSync(hb).mtimeMs;
    if (age > MAX_AGE_MS) fail(`latido viejo (${Math.round(age / 1000)} s)`);
  } catch {
    // El worker todavía no implementa el latido: se evalúa solo la base.
  }
}

if (!process.env.DATABASE_URL) fail("falta DATABASE_URL");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await client.query("select 1");
  await client.end();
} catch (e) {
  fail(`base de datos: ${e instanceof Error ? e.message : String(e)}`);
}
