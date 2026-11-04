import { assertCan, type Ctx, notFound, zRequired } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, scoped } from "../shared/db";

export const SPACE_COLORS = ["#22D3EE", "#7C5CFF", "#FBBF24", "#34D399", "#F472B6", "#60A5FA", "#FB923C", "#A78BFA"];

export const spaceInput = z.object({
  name: zRequired(40, "El nombre"),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#7C5CFF"),
});

export async function listSpaces(ctx: Ctx) {
  return getDb().select().from(schema.space).where(scoped(schema.space, ctx)).orderBy(asc(schema.space.sort), asc(schema.space.createdAt));
}

/** Espacios con conteo de proyectos activos (barra lateral). */
export async function listSpacesWithCounts(ctx: Ctx) {
  const db = getDb();
  const spaces = await listSpaces(ctx);
  const counts = await db
    .select({ spaceId: schema.project.spaceId, n: count() })
    .from(schema.project)
    .where(and(scoped(schema.project, ctx), isNull(schema.project.archivedAt)))
    .groupBy(schema.project.spaceId);
  const map = new Map(counts.map((c) => [c.spaceId, c.n]));
  return spaces.map((s) => ({ ...s, projects: map.get(s.id) ?? 0 }));
}

export async function createSpace(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "space");
  const input = spaceInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [{ n } = { n: 0 }] = await t.select({ n: count() }).from(schema.space).where(scoped(schema.space, ctx));
    const [row] = await t
      .insert(schema.space)
      .values({ workspaceId: ctx.workspaceId, name: input.name, color: input.color, kind: "custom", sort: n, createdBy: ctx.userId })
      .returning();
    if (!row) throw new Error("No se pudo crear");
    await recordEvent(t, ctx, { type: "espacio.creado", entityType: "space", entityId: row.id, summary: `Creó el espacio «${row.name}»` });
    return row;
  });
}

export async function updateSpace(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "space");
  const input = spaceInput.parse(raw);
  const [row] = await getDb()
    .update(schema.space)
    .set({ name: input.name, color: input.color })
    .where(and(eq(schema.space.id, id), scoped(schema.space, ctx)))
    .returning();
  if (!row) throw notFound("El espacio");
  return row;
}

export async function moveSpace(ctx: Ctx, id: string, dir: -1 | 1) {
  assertCan(ctx, "update", "space");
  const spaces = await listSpaces(ctx);
  const i = spaces.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= spaces.length) return;
  const a = spaces[i];
  const b = spaces[j];
  if (!a || !b) return;
  const db = getDb();
  await db.transaction(async (t) => {
    await t.update(schema.space).set({ sort: j }).where(eq(schema.space.id, a.id));
    await t.update(schema.space).set({ sort: i }).where(eq(schema.space.id, b.id));
  });
}

export async function defaultSpaceId(ctx: Ctx, kind: "agency" | "personal" | "study" = "personal"): Promise<string> {
  const spaces = await listSpaces(ctx);
  const s = spaces.find((x) => x.kind === kind) ?? spaces[0];
  if (!s) throw notFound("El espacio");
  return s.id;
}
