import { createHash } from "node:crypto";
import { assertCan, type Ctx, notFound, validation, zOptText, zOptUuid } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, eq, like } from "drizzle-orm";
import { z } from "zod";
import { getDb, scoped } from "../shared/db";
import { dayTranscript, groupByDay, parseWhatsappChat, type WaMessage } from "./whatsapp";

/** Máximo del texto pegado/subido (el límite de las Server Actions es 2 MB). */
export const WA_MAX_CHARS = 1_800_000;
/** Máximo por interacción (una por día). */
export const WA_DAY_MAX = 20_000;

const zChat = z
  .string({ error: "Pegá o subí el chat exportado" })
  .min(1, "Pegá o subí el chat exportado")
  .max(WA_MAX_CHARS, "El chat es muy grande (máx. ~1,8 MB). Exportalo sin multimedia o en partes.");

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Identifica el chat por sus participantes (dos importaciones del mismo chat comparten clave). */
const chatKeyOf = (names: string[]) => sha([...names].sort().join("|")).slice(0, 12);
const dayHash = (messages: WaMessage[]) => sha(JSON.stringify(messages.map((m) => [m.time, m.author, m.text, m.media]))).slice(0, 16);
const marker = (chatKey: string, date: string, hash: string) => `<!-- wa-import:${chatKey}:${date}:${hash} -->`;
const MARKER_RE = /<!-- wa-import:([0-9a-f]{12}):(\d{4}-\d{2}-\d{2}):([0-9a-f]{16}) -->/;

export async function previewWhatsapp(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "read", "crm");
  const { text } = z.object({ text: zChat }).parse(raw);
  const chat = parseWhatsappChat(text);
  if (!chat.messages.length)
    throw validation("No encontré mensajes. Usá «Exportar chat» de WhatsApp (sin multimedia) y subí el .txt.", { text: "Formato no reconocido" });
  return {
    messages: chat.messages.length,
    media: chat.messages.filter((m) => m.media).length,
    from: chat.from,
    to: chat.to,
    days: chat.days,
    participants: chat.participants,
  };
}

export const importWhatsappInput = z.object({
  clientId: z.string({ error: "Elegí un cliente" }).uuid("Elegí un cliente"),
  contactId: zOptUuid,
  text: zChat,
  me: zOptText(80),
});

/**
 * Crea una interacción (canal WhatsApp) por día con la transcripción en Markdown.
 * Deduplica con una marca invisible por chat y día: mismo contenido → se saltea; día ampliado → se actualiza.
 */
export async function importWhatsapp(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "crm");
  const input = importWhatsappInput.parse(raw);
  const chat = parseWhatsappChat(input.text);
  if (!chat.messages.length) throw validation("No encontré mensajes en el chat.", { text: "Formato no reconocido" });
  if (input.me && !chat.participants.some((p) => p.name === input.me)) throw validation("Ese participante no está en el chat", { me: "Elegí un participante" });
  const meLabel = ctx.actor.name?.trim() || "Yo";
  const chatKey = chatKeyOf(chat.participants.map((p) => p.name));
  const days = groupByDay(chat.messages);

  return getDb().transaction(async (t) => {
    const [client] = await t
      .select({ id: schema.client.id, name: schema.client.name, lastActivityAt: schema.client.lastActivityAt })
      .from(schema.client)
      .where(and(eq(schema.client.id, input.clientId), scoped(schema.client, ctx, { withArchived: true })));
    if (!client) throw notFound("El cliente");
    if (input.contactId) {
      const [ct] = await t
        .select({ id: schema.contact.id })
        .from(schema.contact)
        .where(and(eq(schema.contact.id, input.contactId), scoped(schema.contact, ctx)));
      if (!ct) throw validation("El contacto no existe", { contactId: "Elegí un contacto válido" });
    }
    const existing = await t
      .select({ id: schema.interaction.id, summaryMd: schema.interaction.summaryMd })
      .from(schema.interaction)
      .where(and(scoped(schema.interaction, ctx), eq(schema.interaction.clientId, client.id), like(schema.interaction.summaryMd, `%wa-import:${chatKey}:%`)));
    const byDate = new Map<string, { id: string; hash: string }>();
    for (const e of existing) {
      const m = e.summaryMd.match(MARKER_RE);
      if (m?.[2] && m[3]) byDate.set(m[2], { id: e.id, hash: m[3] });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let latest: Date | null = null;
    for (const day of days) {
      const hash = dayHash(day.messages);
      const prev = byDate.get(day.date);
      if (prev?.hash === hash) {
        skipped++;
        continue;
      }
      const summaryMd = `${dayTranscript(day, { me: input.me, meLabel, max: WA_DAY_MAX })}\n\n${marker(chatKey, day.date, hash)}`;
      const occurredAt = new Date(`${day.date}T${day.messages[0]?.time ?? "12:00"}:00-03:00`);
      if (!latest || occurredAt > latest) latest = occurredAt;
      if (prev) {
        await t.update(schema.interaction).set({ summaryMd, occurredAt }).where(eq(schema.interaction.id, prev.id));
        updated++;
      } else {
        await t.insert(schema.interaction).values({
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
          clientId: client.id,
          contactId: input.contactId ?? null,
          kind: "whatsapp",
          occurredAt,
          summaryMd,
        });
        created++;
      }
    }
    if (latest && (!client.lastActivityAt || latest > client.lastActivityAt))
      await t.update(schema.client).set({ lastActivityAt: latest }).where(eq(schema.client.id, client.id));
    if (created || updated)
      await recordEvent(t, ctx, {
        type: "interaccion.whatsapp_importado",
        entityType: "client",
        entityId: client.id,
        summary: `Importó un chat de WhatsApp con «${client.name}»: ${created} ${created === 1 ? "día nuevo" : "días nuevos"}${updated ? `, ${updated} actualizado${updated === 1 ? "" : "s"}` : ""}`,
        payload: { created, updated, skipped, from: chat.from, to: chat.to },
      });
    return { created, updated, skipped, days: days.length, messages: chat.messages.length };
  });
}
