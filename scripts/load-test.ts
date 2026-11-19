/**
 * Prueba de carga con autocannon contra `next start` (docs/SCALING.md §Prueba de carga).
 *
 *   # 1) base de volumen + build de producción apuntando a ella
 *   DATABASE_URL=…/agencyos_vol pnpm seed:volumen
 *   DATABASE_URL=…/agencyos_vol AUTH_SECRET=… pnpm --filter @agencyos/web build && … next start --port 3320
 *   # 2) carga (mismas DATABASE_URL y AUTH_SECRET que el servidor)
 *   DATABASE_URL=…/agencyos_vol AUTH_SECRET=… LOAD_URL=http://localhost:3320 pnpm load:test [--segundos 20] [--conexiones 10]
 *
 * Login programático: crea una sesión de Better Auth para el usuario de volumen directamente en la base y firma la
 * cookie con AUTH_SECRET (igual que better-call). La sesión se borra al terminar. Nunca contra producción.
 */
import { createHmac, randomBytes } from "node:crypto";
import { getPool, schema } from "@agencyos/db";
import autocannon from "autocannon";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { VOLUME_EMAIL } from "./seed-volumen-const";

const url = process.env.DATABASE_URL ?? "";
const secret = process.env.AUTH_SECRET ?? "";
const base = process.env.LOAD_URL ?? "http://localhost:3320";
if (!/test|vol|e2e/.test(url) || !secret) {
  console.error("load-test: DATABASE_URL debe ser una base de prueba (test/vol/e2e) y AUTH_SECRET el del servidor.");
  process.exit(1);
}
const arg = (name: string, d: number) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1] ?? d) : d;
};
const SECONDS = arg("--segundos", 20);
const CONNECTIONS = arg("--conexiones", 10);

async function main() {
  const db = drizzle(getPool(), { schema });
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, VOLUME_EMAIL));
  if (!u) throw new Error("Falta el usuario de volumen: corré pnpm seed:volumen");
  const token = randomBytes(24).toString("base64url");
  const id = `load_${randomBytes(8).toString("hex")}`;
  await db.insert(schema.session).values({ id, token, userId: u.id, expiresAt: new Date(Date.now() + 3_600_000), userAgent: "load-test" });
  const sig = createHmac("sha256", secret).update(token).digest("base64");
  const cookie = `agencyos.session_token=${encodeURIComponent(`${token}.${sig}`)}`;

  // Comprobación: con la cookie, /hoy responde 200 (no redirige a /login).
  const probe = await fetch(`${base}/hoy`, { headers: { cookie }, redirect: "manual" });
  if (probe.status !== 200) throw new Error(`La sesión no funcionó: /hoy → ${probe.status} ${probe.headers.get("location") ?? ""}`);

  const targets = [
    ["Hoy", "/hoy"],
    ["Tareas (abiertas)", "/tareas?ver=todas"],
    ["Tareas (completadas)", "/tareas?ver=completadas"],
    ["Clientes", "/crm/clientes"],
    ["Notas", "/notas"],
    ["Movimientos", "/finanzas/movimientos"],
    ["Búsqueda en tareas", "/tareas?ver=todas&q=dise%C3%B1o"],
    ["Búsqueda en notas (FTS)", "/notas?q=nota%204321"],
    ["Cerebro", "/cerebro"],
    ["Health (readiness)", "/api/health"],
  ] as const;
  const rows: string[] = [];
  for (const [name, path] of targets) {
    const r = await autocannon({
      url: `${base}${path}`,
      connections: CONNECTIONS,
      duration: SECONDS,
      timeout: 30,
      headers: { cookie },
    });
    const non2xx = r.non2xx + r.errors + r.timeouts;
    rows.push(
      `| ${name} | \`${path}\` | ${r.latency.p50} | ${r.latency.p90} | ${r.latency.p97_5} | ${r.latency.p99} | ${r.requests.average.toFixed(1)} | ${r.requests.total} | ${non2xx} |`,
    );
    console.log(`${name}: p50 ${r.latency.p50} ms · p97.5 ${r.latency.p97_5} ms · ${r.requests.average.toFixed(1)} req/s · errores ${non2xx}`);
  }
  console.log(`\n${CONNECTIONS} conexiones · ${SECONDS} s por ruta · ${base}\n`);
  console.log("| Pantalla | Ruta | p50 ms | p90 ms | p97,5 ms | p99 ms | req/s | pedidos | no-2xx |");
  console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of rows) console.log(r);
  await db.delete(schema.session).where(eq(schema.session.id, id));
}

main()
  .then(() => getPool().end())
  .catch(async (e) => {
    console.error(e);
    await getPool().end();
    process.exit(1);
  });
