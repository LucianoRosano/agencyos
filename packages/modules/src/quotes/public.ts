import { createHash, randomBytes } from "node:crypto";
import { assertCan, type Ctx, conflict, notFound, systemCtx, validation, zInt } from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { getDb, schema } from "@agencyos/db";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { scoped } from "../shared/db";
import { getQuoteDocument } from "./queries";
import { acceptQuote, rejectQuote } from "./service";

/**
 * Enlace público de un presupuesto (docs/02 M04, F2): token aleatorio de 256 bits (se guarda solo el hash),
 * con vencimiento y revocable. El cliente ve, descarga, acepta o rechaza; se registran nombre, fecha, IP y navegador.
 */
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createPublicLink(ctx: Ctx, quoteId: string, rawDays: number = 30) {
  assertCan(ctx, "update", "quote");
  const days = zInt(1, 180).parse(rawDays);
  const token = randomBytes(32).toString("base64url");
  return getDb().transaction(async (t) => {
    const [q] = await t
      .select()
      .from(schema.quote)
      .where(and(eq(schema.quote.id, quoteId), scoped(schema.quote, ctx)));
    if (!q) throw notFound("El presupuesto");
    if (!["sent", "viewed"].includes(q.status)) throw conflict("Marcá el presupuesto como enviado antes de compartir el enlace.");
    const expires = new Date(Date.now() + days * 86_400_000);
    await t
      .update(schema.quote)
      .set({ publicTokenHash: hash(token), publicExpiresAt: expires })
      .where(eq(schema.quote.id, q.id));
    await audit(t, ctx, { action: "quote.public_link_created", targetType: "quote", targetId: q.id, after: { expiresAt: expires } });
    return { token, expiresAt: expires };
  });
}

export async function revokePublicLink(ctx: Ctx, quoteId: string) {
  assertCan(ctx, "update", "quote");
  return getDb().transaction(async (t) => {
    const [q] = await t
      .update(schema.quote)
      .set({ publicTokenHash: null, publicExpiresAt: null })
      .where(and(eq(schema.quote.id, quoteId), scoped(schema.quote, ctx)))
      .returning();
    if (!q) throw notFound("El presupuesto");
    await audit(t, ctx, { action: "quote.public_link_revoked", targetType: "quote", targetId: q.id });
    return q;
  });
}

/** Contexto del "cliente" para las acciones públicas: sistema del workspace, actor identificado. */
function clientCtx(workspaceId: string, name: string, ip?: string | null, userAgent?: string | null): Ctx {
  return { ...systemCtx(workspaceId), actor: { type: "system", id: null, name: `Cliente (${name})` }, ip: ip ?? null, userAgent: userAgent ?? null };
}

async function resolveToken(token: string) {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) return null;
  const [q] = await getDb()
    .select()
    .from(schema.quote)
    .where(and(eq(schema.quote.publicTokenHash, hash(token)), isNull(schema.quote.deletedAt)));
  if (!q || !q.publicExpiresAt || q.publicExpiresAt < new Date()) return null;
  return q;
}

type QuoteRow = typeof schema.quote.$inferSelect;

/** Abre el presupuesto público: devuelve el documento y marca "visto" la primera vez. */
export async function openPublicQuote(token: string) {
  const q = await resolveToken(token);
  if (!q) return null;
  return openQuoteForClient(q, "enlace público");
}

/**
 * Vista del cliente (enlace público o portal, M15): marca "visto" la primera vez y devuelve documento y decisión.
 * Quien llama ya verificó el acceso (token vigente o cliente del portal dueño del presupuesto).
 */
export async function openQuoteForClient(q: QuoteRow, via: string) {
  const ctx = clientCtx(q.workspaceId, via);
  if (q.status === "sent") {
    await getDb().transaction(async (t) => {
      await t
        .update(schema.quote)
        .set({ status: "viewed", viewedAt: new Date() })
        .where(and(eq(schema.quote.id, q.id), eq(schema.quote.status, "sent")));
      await recordEvent(t, ctx, { type: "presupuesto.visto", entityType: "quote", entityId: q.id, summary: `El cliente abrió el presupuesto ${q.number}` });
    });
  }
  const doc = await getQuoteDocument(ctx, q.id);
  if (!doc) return null;
  const [decision] = await getDb().select().from(schema.quoteDecision).where(eq(schema.quoteDecision.quoteId, q.id)).limit(1);
  return {
    quote: { id: q.id, number: q.number, title: q.title, status: q.status === "sent" ? "viewed" : q.status, expiresAt: q.publicExpiresAt },
    doc,
    decision: decision ?? null,
  };
}

export const decisionInput = z.object({
  decision: z.enum(["accepted", "rejected"]),
  signerName: z.string().trim().min(3, "Escribí tu nombre y apellido").max(120),
  comment: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(2000).optional()),
  agree: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

/**
 * Decisión del cliente. Aceptar: el presupuesto pasa a aceptado y, como si lo hiciera Luciano,
 * se crean el proyecto, los cobros según el plan y la oportunidad queda ganada (ADR 0010).
 */
export async function decidePublicQuote(token: string, raw: unknown, meta: { ip?: string | null; userAgent?: string | null }) {
  const q = await resolveToken(token);
  if (!q) throw notFound("El enlace");
  return decideQuoteForClient(q, raw, { ...meta, via: "public" });
}

/** Decisión del cliente (enlace público o portal): misma regla y mismos efectos en ambos canales (ADR 0010). */
export async function decideQuoteForClient(q: QuoteRow, raw: unknown, meta: { ip?: string | null; userAgent?: string | null; via: "public" | "portal" }) {
  const input = decisionInput.parse(raw);
  if (input.decision === "accepted" && !input.agree) throw validation("Confirmá que aceptás las condiciones", { agree: "Obligatorio" });
  if (!["sent", "viewed"].includes(q.status)) throw conflict("Este presupuesto ya no admite cambios. Escribile a Luciano.");
  const [prev] = await getDb().select({ id: schema.quoteDecision.id }).from(schema.quoteDecision).where(eq(schema.quoteDecision.quoteId, q.id)).limit(1);
  if (prev) throw conflict("Este presupuesto ya tiene una respuesta registrada.");
  const ctx = clientCtx(q.workspaceId, input.signerName, meta.ip, meta.userAgent);
  await getDb()
    .insert(schema.quoteDecision)
    .values({
      workspaceId: q.workspaceId,
      quoteId: q.id,
      versionId: q.currentVersionId as string,
      decision: input.decision,
      signerName: input.signerName,
      comment: input.comment,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    });
  if (input.decision === "accepted") {
    await acceptQuote(ctx, q.id, { createProject: true, createReceivables: true, markOpportunityWon: true });
  } else {
    await rejectQuote(ctx, q.id, input.comment ?? `Rechazado por ${input.signerName} desde ${meta.via === "portal" ? "el portal" : "el enlace"}`);
  }
  await audit(getDb(), ctx, { action: `quote.${meta.via}_${input.decision}`, targetType: "quote", targetId: q.id, after: { signerName: input.signerName } });
  return { decision: input.decision };
}

export async function publicQuoteDocument(token: string) {
  const q = await resolveToken(token);
  if (!q) return null;
  return getQuoteDocument(clientCtx(q.workspaceId, "enlace público"), q.id);
}
