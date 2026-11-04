import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "./client";

const folder = fileURLToPath(new URL("../migrations", import.meta.url));
await migrate(getDb(), { migrationsFolder: folder });
console.log("Migraciones aplicadas.");
await closeDb();
