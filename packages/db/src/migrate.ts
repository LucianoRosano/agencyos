import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Las migraciones (CREATE INDEX sobre tablas grandes) no deben cortarse por statement_timeout.
process.env.AGENCYOS_ROLE ??= "migrate";
const { closeDb, getDb } = await import("./client");

const folder = fileURLToPath(new URL("../migrations", import.meta.url));
await migrate(getDb(), { migrationsFolder: folder });
console.log("Migraciones aplicadas.");
await closeDb();
