import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { addDays, assertCan, type Ctx, type Role, todayAR, validation } from "@agencyos/core";
import { audit } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, eq } from "drizzle-orm";
import { getDb } from "../shared/db";
import { buildIcs } from "./ical";
import { getCalendarItems } from "./queries";

/**
 * Suscripción iCal de solo lectura (M12b). El token viaja solo en la URL y se muestra una vez;
 * en la base queda su SHA-256 en `user_preference` (key `ical_token`).
 * Se guarda también el workspace para resolver el contexto sin sesión.
 */
export const ICAL_PREF_KEY = "ical_token";
type IcalPref = { hash: string; createdAt: string; workspaceId: string };

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

function requireUser(ctx: Ctx): string {
  if (!ctx.userId || ctx.actor.type !== "user") throw validation("La suscripción al calendario es personal: necesita una sesión de usuario");
  return ctx.userId;
}

export async function getIcalStatus(ctx: Ctx): Promise<{ active: boolean; createdAt: string | null }> {
  if (!ctx.userId) return { active: false, createdAt: null };
  const [row] = await getDb()
    .select()
    .from(schema.userPreference)
    .where(and(eq(schema.userPreference.userId, ctx.userId), eq(schema.userPreference.key, ICAL_PREF_KEY)));
  const v = row?.value as Partial<IcalPref> | undefined;
  return { active: Boolean(v?.hash), createdAt: v?.createdAt ?? null };
}

/** Genera (o rota) el token. Devuelve el token en claro UNA sola vez. */
export async function rotateIcalToken(ctx: Ctx): Promise<{ token: string; createdAt: string }> {
  assertCan(ctx, "read", "task");
  const userId = requireUser(ctx);
  const token = randomBytes(32).toString("base64url");
  const value: IcalPref = { hash: sha256(token), createdAt: new Date().toISOString(), workspaceId: ctx.workspaceId };
  await getDb().transaction(async (t) => {
    const [prev] = await t
      .select({ id: schema.userPreference.id })
      .from(schema.userPreference)
      .where(and(eq(schema.userPreference.userId, userId), eq(schema.userPreference.key, ICAL_PREF_KEY)));
    await t
      .insert(schema.userPreference)
      .values({ userId, key: ICAL_PREF_KEY, value })
      .onConflictDoUpdate({ target: [schema.userPreference.userId, schema.userPreference.key], set: { value, updatedAt: new Date() } });
    await audit(t, ctx, { action: prev ? "calendario.ical_rotado" : "calendario.ical_creado", targetType: "user_preference", targetId: null });
  });
  return { token, createdAt: value.createdAt };
}

export async function revokeIcalToken(ctx: Ctx): Promise<{ revoked: boolean }> {
  const userId = requireUser(ctx);
  return getDb().transaction(async (t) => {
    const rows = await t
      .delete(schema.userPreference)
      .where(and(eq(schema.userPreference.userId, userId), eq(schema.userPreference.key, ICAL_PREF_KEY)))
      .returning({ id: schema.userPreference.id });
    if (rows.length) await audit(t, ctx, { action: "calendario.ical_revocado", targetType: "user_preference", targetId: null });
    return { revoked: rows.length > 0 };
  });
}

/**
 * Resuelve un token a un contexto de solo lectura. Compara hashes en tiempo constante
 * contra todos los tokens activos (son pocos: uno por usuario). Devuelve null si no vale.
 */
export async function resolveIcalToken(token: string): Promise<Ctx | null> {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null;
  const candidate = Buffer.from(sha256(token), "hex");
  const db = getDb();
  const rows = await db.select().from(schema.userPreference).where(eq(schema.userPreference.key, ICAL_PREF_KEY));
  let match: { userId: string; value: IcalPref } | null = null;
  for (const r of rows) {
    const v = r.value as Partial<IcalPref>;
    if (typeof v.hash !== "string" || v.hash.length !== 64) continue;
    const stored = Buffer.from(v.hash, "hex");
    if (stored.length === candidate.length && timingSafeEqual(stored, candidate) && !match) match = { userId: r.userId, value: v as IcalPref };
  }
  if (!match) return null;
  const [m] = await db
    .select()
    .from(schema.membership)
    .where(and(eq(schema.membership.userId, match.userId), eq(schema.membership.workspaceId, match.value.workspaceId)));
  if (!m) return null;
  const [u] = await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, match.userId));
  return { workspaceId: m.workspaceId, userId: match.userId, role: m.role as Role, actor: { type: "user", id: match.userId, name: u?.name ?? "Calendario" } };
}

/** Feed iCal: desde 60 días atrás hasta 1 año adelante. */
export async function icalFeed(token: string, opts: { baseUrl?: string; now?: Date } = {}): Promise<string | null> {
  const ctx = await resolveIcalToken(token);
  if (!ctx) return null;
  const today = todayAR(opts.now);
  const items = await getCalendarItems(ctx, { from: addDays(today, -60), to: addDays(today, 366) });
  return buildIcs(items, { baseUrl: opts.baseUrl, now: opts.now, name: "AGENCYOS" });
}
