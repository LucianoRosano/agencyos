import { validation } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { getAuth } from "./server";

const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60_000;

/** Reautenticación para acciones críticas (docs/08 §2): verifica la contraseña del usuario. */
export async function verifyPassword(userId: string, password: string): Promise<void> {
  if (!password) throw validation("Confirmá tu contraseña", { password: "Obligatoria" });
  const db = getDb();
  const [fails] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.action, "reauth.failed"), eq(schema.auditLog.actorId, userId), gte(schema.auditLog.at, new Date(Date.now() - WINDOW_MS))));
  if ((fails?.n ?? 0) >= MAX_FAILS) throw validation("Demasiados intentos. Esperá 15 minutos.", { password: "Demasiados intentos" });
  const actx = await getAuth().$context;
  const accounts = await actx.internalAdapter.findAccounts(userId);
  const cred = accounts.find((a) => a.providerId === "credential" && a.password);
  if (!cred?.password || !(await actx.password.verify({ hash: cred.password, password }))) {
    await db.insert(schema.auditLog).values({ actorType: "user", actorId: userId, action: "reauth.failed" });
    throw validation("Contraseña incorrecta", { password: "Contraseña incorrecta" });
  }
}

/** Restablece la contraseña desde el servidor (CLI de administración), sin email. */
export async function adminSetPassword(email: string, newPassword: string): Promise<void> {
  if (newPassword.length < 12) throw validation("Mínimo 12 caracteres");
  const actx = await getAuth().$context;
  const user = await actx.internalAdapter.findUserByEmail(email.toLowerCase());
  if (!user) throw validation("No existe un usuario con ese email");
  const hash = await actx.password.hash(newPassword);
  await actx.internalAdapter.updatePassword(user.user.id, hash);
  await actx.internalAdapter.deleteUserSessions(user.user.id);
}
