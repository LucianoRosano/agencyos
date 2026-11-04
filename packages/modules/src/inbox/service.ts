import { assertCan, type Ctx, notFound, zOptUuid, zRequired } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { assertOwned, getDb, scoped } from "../shared/db";

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
    await assertOwned(t, ctx, schema.space, input.spaceId, "El espacio");
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
  assertCan(ctx, "create", "inbox");
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

/** Convierte un ítem en tarea (y lo marca procesado) en una sola transacción. */
export async function convertToTask(ctx: Ctx, id: string, raw: Record<string, unknown>) {
  const { createTask } = await import("../tasks/service");
  return getDb().transaction(async (t) => {
    const [item] = await t.select().from(schema.inboxItem).where(and(eq(schema.inboxItem.id, id), scoped(schema.inboxItem, ctx), isNull(schema.inboxItem.processedAt)));
    if (!item) throw notFound("El ítem");
    const task = await createTask(ctx, { title: item.text.slice(0, 300), spaceId: item.spaceId ?? undefined, ...raw }, t);
    await t.update(schema.inboxItem).set({ processedAt: new Date(), resultEntityType: "task", resultEntityId: task.id }).where(eq(schema.inboxItem.id, id));
    return task;
  });
}

/** Convierte un ítem en nota (idea, link o nota) con el servicio de Notas, en una transacción. */
export async function convertToNote(ctx: Ctx, id: string, title?: string) {
  assertCan(ctx, "create", "note");
  const { createNoteInTx } = await import("../notes/service");
  return getDb().transaction(async (t) => {
    const [item] = await t.select().from(schema.inboxItem).where(and(eq(schema.inboxItem.id, id), scoped(schema.inboxItem, ctx), isNull(schema.inboxItem.processedAt)));
    if (!item) throw notFound("El ítem");
    const noteTitle = (title?.trim() || item.text.split("\n")[0] || "Nota").slice(0, 160);
    const note = await createNoteInTx(t, ctx, { title: noteTitle, spaceId: item.spaceId ?? undefined, bodyMd: item.text });
    await t.update(schema.inboxItem).set({ processedAt: new Date(), resultEntityType: "note", resultEntityId: note.id }).where(eq(schema.inboxItem.id, id));
    return note;
  });
}

export async function setItemSpace(ctx: Ctx, id: string, spaceId: string) {
  assertCan(ctx, "create", "inbox");
  await assertOwned(getDb(), ctx, schema.space, spaceId, "El espacio");
  const [row] = await getDb().update(schema.inboxItem).set({ spaceId }).where(and(eq(schema.inboxItem.id, id), scoped(schema.inboxItem, ctx))).returning();
  if (!row) throw notFound("El ítem");
  return row;
}

export async function updateItemText(ctx: Ctx, id: string, text: string) {
  assertCan(ctx, "create", "inbox");
  const parsed = zRequired(2000, "El texto").parse(text);
  const [row] = await getDb().update(schema.inboxItem).set({ text: parsed }).where(and(eq(schema.inboxItem.id, id), scoped(schema.inboxItem, ctx))).returning();
  if (!row) throw notFound("El ítem");
  return row;
}
