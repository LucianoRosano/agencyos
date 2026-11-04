import "server-only";
import type { Ctx } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { projectOptions } from "@agencyos/modules/projects/queries";
import { scoped } from "@agencyos/modules/shared/db";
import { listSpaces } from "@agencyos/modules/spaces/service";
import { and, asc, ne } from "drizzle-orm";

export async function spaceOpts(ctx: Ctx) {
  return (await listSpaces(ctx)).map((s) => ({ value: s.id, label: s.name }));
}
export async function projectOpts(ctx: Ctx) {
  return (await projectOptions(ctx)).map((p) => ({ value: p.id, label: p.name }));
}
export async function clientOpts(ctx: Ctx) {
  const rows = await getDb()
    .select({ id: schema.client.id, name: schema.client.name })
    .from(schema.client)
    .where(and(scoped(schema.client, ctx), ne(schema.client.status, "archived")))
    .orderBy(asc(schema.client.name));
  return rows.map((c) => ({ value: c.id, label: c.name }));
}
