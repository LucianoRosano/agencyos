import type { Ctx } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "../shared/crypto";

/**
 * Web Push (PWA). Las claves VAPID se generan una vez por workspace y se guardan cifradas en `integration`
 * (provider "webpush"): no hace falta configurar nada. Requiere HTTPS (o localhost).
 */
type Vapid = { publicKey: string; privateKey: string };

async function vapidFor(workspaceId: string): Promise<Vapid> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.integration)
    .where(and(eq(schema.integration.workspaceId, workspaceId), eq(schema.integration.provider, "webpush")));
  if (row?.secretEnc) return { publicKey: String(row.config.publicKey), privateKey: decryptSecret(row.secretEnc) };
  const keys = webpush.generateVAPIDKeys();
  await db
    .insert(schema.integration)
    .values({
      workspaceId,
      provider: "webpush",
      name: "Notificaciones push",
      config: { publicKey: keys.publicKey },
      secretEnc: encryptSecret(keys.privateKey),
    });
  return keys;
}

export async function publicVapidKey(ctx: Ctx) {
  return (await vapidFor(ctx.workspaceId)).publicKey;
}

export const subscriptionInput = z.object({
  endpoint: z.string().url().startsWith("https://", "Suscripción inválida"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export async function savePushSubscription(ctx: Ctx, raw: unknown, userAgent?: string | null) {
  if (!ctx.userId) throw new Error("Sin usuario");
  const sub = subscriptionInput.parse(raw);
  await getDb()
    .insert(schema.pushSubscription)
    .values({ workspaceId: ctx.workspaceId, userId: ctx.userId, endpoint: sub.endpoint, keys: sub.keys, userAgent: userAgent?.slice(0, 300) ?? null })
    .onConflictDoUpdate({ target: schema.pushSubscription.endpoint, set: { keys: sub.keys, userId: ctx.userId, workspaceId: ctx.workspaceId } });
}

export async function removePushSubscription(ctx: Ctx, endpoint: string) {
  if (!ctx.userId) return;
  await getDb()
    .delete(schema.pushSubscription)
    .where(and(eq(schema.pushSubscription.endpoint, endpoint), eq(schema.pushSubscription.userId, ctx.userId)));
}

export async function listPushDevices(ctx: Ctx) {
  if (!ctx.userId) return [];
  return getDb()
    .select({
      id: schema.pushSubscription.id,
      endpoint: schema.pushSubscription.endpoint,
      userAgent: schema.pushSubscription.userAgent,
      createdAt: schema.pushSubscription.createdAt,
    })
    .from(schema.pushSubscription)
    .where(and(eq(schema.pushSubscription.userId, ctx.userId), eq(schema.pushSubscription.workspaceId, ctx.workspaceId)));
}

/** ¿Este tipo de evento va por push/email para el usuario? Por defecto: push sí, email no. */
export async function channelsFor(userId: string, eventType: string) {
  const [pref] = await getDb()
    .select()
    .from(schema.notificationPreference)
    .where(and(eq(schema.notificationPreference.userId, userId), eq(schema.notificationPreference.eventType, eventType)));
  return { inApp: pref?.inApp ?? true, push: pref?.push ?? true, email: pref?.email ?? false };
}

export async function setPreference(ctx: Ctx, eventType: string, channels: { inApp: boolean; push: boolean; email: boolean }) {
  if (!ctx.userId) return;
  const type = z
    .string()
    .regex(/^[a-z_]+\.[a-z_]+$/)
    .parse(eventType);
  await getDb()
    .insert(schema.notificationPreference)
    .values({ workspaceId: ctx.workspaceId, userId: ctx.userId, eventType: type, ...channels })
    .onConflictDoUpdate({ target: [schema.notificationPreference.userId, schema.notificationPreference.eventType], set: channels });
}

/** Envía un push a todos los dispositivos del usuario; borra las suscripciones vencidas (404/410). */
export async function sendPush(workspaceId: string, userId: string, payload: { title: string; body?: string; url?: string; tag?: string }) {
  const subs = await getDb()
    .select()
    .from(schema.pushSubscription)
    .where(and(eq(schema.pushSubscription.userId, userId), eq(schema.pushSubscription.workspaceId, workspaceId)));
  if (!subs.length) return 0;
  const vapid = await vapidFor(workspaceId);
  const subject = process.env.VAPID_SUBJECT ?? "mailto:lucianorosanott@gmail.com";
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), {
        vapidDetails: { subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
        TTL: 60 * 60 * 24,
        timeout: 10_000,
      });
      sent++;
      await getDb().update(schema.pushSubscription).set({ lastOkAt: new Date() }).where(eq(schema.pushSubscription.id, s.id));
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await getDb().delete(schema.pushSubscription).where(eq(schema.pushSubscription.id, s.id));
    }
  }
  return sent;
}
