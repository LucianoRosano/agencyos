import { execSync } from "node:child_process";
import pg from "pg";

/** Base de tests limpia y migrada (una vez por corrida). */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://agencyos:agencyos@127.0.0.1:5432/agencyos_test";
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await c.end();
  execSync("pnpm --filter @agencyos/db migrate", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
