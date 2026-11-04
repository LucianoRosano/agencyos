import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "../uuid";

export const tz = (name?: string) => (name ? timestamp(name, { withTimezone: true, mode: "date" }) : timestamp({ withTimezone: true, mode: "date" }));

export const pk = () => uuid("id").primaryKey().$defaultFn(uuidv7);

/** Columnas comunes de toda tabla de negocio (docs/04 · Convenciones). */
export const baseColumns = () => ({
  id: pk(),
  workspaceId: uuid("workspace_id").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  createdBy: text("created_by"),
  archivedAt: tz("archived_at"),
  deletedAt: tz("deleted_at"),
});
