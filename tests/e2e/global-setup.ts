import { execSync } from "node:child_process";
import pg from "pg";

/** Base de e2e limpia y migrada en cada corrida (datos SOLO de test). */
export default async function globalSetup() {
  if (process.env.E2E_BASE_URL) return; // contra staging no se resetea nada
  const url = process.env.E2E_DATABASE_URL ?? "postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_e2e";
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await c.end();
  execSync("pnpm --filter @agencyos/db migrate", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
