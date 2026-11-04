import { assertCan, type Ctx, notFound, zOptUuid, zRequired } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, scoped } from "../shared/db";

export const INBOX_TYPES = ["task", "note", "idea", "expense", "link"] as const;

export const captureInput = z.object({
  text: zRequired(2000, "El texto"),
  suggestedType: z.preprocess((v) => (v === "" ? undefined : v), z.enum(INBOX_TYPES).optional()),
  spaceId: zOptUuid,
});

/** Detecta el tipo por el texto si no se indicó (link si es URL, gasto si empieza con $). */
export function guessType(text: string): (typeof INBOX_TYPES)[number] | undefined {
  const s = text.trim();
  if (/^https?:\/\/\S+$/i.test(s)) return "link";
  if (/^(\$|us\$|gasto[: ])/i.test(s)) return "expense";
  return undefined;
}

export async function capture(ctx: Ctx, raw: unknown, source: "app" | "mcp" = "app") {
  assertCan(ctx, "create", "inbox");
  const input = captureInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .insert(schema.inboxItem)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, text: input.text, suggestedType: input.suggestedType ?? guessType(input.text) ?? null, spaceId: input.spaceId ?? null, source })
      .returning();
    if (!row) throw new Error("No se pudo capturar");
    await recordEvent(t, ctx, { type: "bandeja.capturado", entityType: "inbox_item", entityId: row.id, summary: `Capturó en la Bandeja: ${row.text.slice(0, 80)}` });
    return row;
  });
}

export async function listPending(ctx: Ctx) {
  return getDb()
    .select()
    .from(schema.inboxItem)
    .where(and(scoped(schema.inboxItem, ctx), isNull(schema.inboxItem.processedAt)))
    .orderBy(asc(schema.inboxItem.createdAt));
}

export async function pendingCount(ctx: Ctx) {
  const [r] = await getDb()
    .select({ n: count() })
    .from(schema.inboxItem)
    .where(and(scoped(schema.inboxItem, ctx), isNull(schema.inboxItem.processedAt)));
  return r?.n ?? 0;
}

/** Marca un ítem como procesado (convertido en otra entidad o descartado). */
export async function markProcessed(ctx: Ctx, id: string, result?: { type: string; id: string }) {
  assertCan(ctx, "create", "inbox");
  const [row] = await getDb()
    .update(schema.inboxItem)
    .set({ processedAt: new Date(), resultEntityType: result?.type ?? null, resultEntityId: result?.id ?? null })
    .where(and(eq(schema.inboxItem.id, id), scoped(schema.inboxItem, ctx)))
    .returning();
  if (!row) throw notFound("El ítem");
  return row;
}

export async function unprocess(ctx: Ctx, id: string) {
  const [row] = await getDb()
    .update(schema.inboxItem)
    .set({ processedAt: null, resultEntityType: null, resultEntityId: null })
    .where(and(eq(schema.inboxItem.id, id), scoped(schema.inboxItem, ctx)))
    .returning();
  return row;
}

export async function getItem(ctx: Ctx, id: string) {
  const [row] = await getDb().select().from(schema.inboxItem).where(and(eq(schema.inboxItem.id, id), scoped(schema.inboxItem, ctx)));
  if (!row) throw notFound("El ítem");
  return row;
}
