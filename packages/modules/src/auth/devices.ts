import { deviceLabel, formatDateTime } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { sendEmail } from "../shared/email";

/**
 * Alerta de inicio de sesión desde un dispositivo nuevo (navegador + sistema). Los dispositivos conocidos quedan en
 * el registro de auditoría (`auth.device`, uno por usuario y dispositivo). El primero no avisa (es el alta); los
 * siguientes generan una notificación en cada workspace del usuario (salvo como cliente) y un email si hay Brevo.
 * Nunca bloquea el ingreso: los errores se registran y se siguen.
 */
export async function recordLoginDevice(s: { userId: string; userAgent?: string | null; ipAddress?: string | null }, now = new Date()) {
  const label = deviceLabel(s.userAgent);
  const key = label.toLowerCase();
  const db = getDb();
  const alert = await db.transaction(async (t) => {
    // Serializa los ingresos simultáneos del mismo usuario (dos pestañas): un solo aviso por dispositivo.
    await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`device:${s.userId}`}))`);
    const seen = await t
      .select({ target: schema.auditLog.targetId })
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.actorId, s.userId), eq(schema.auditLog.action, "auth.device")));
    if (seen.some((r) => r.target === key)) return false;
    await t.insert(schema.auditLog).values({
      actorType: "user",
      actorId: s.userId,
      action: "auth.device",
      targetType: "device",
      targetId: key,
      ip: s.ipAddress ?? null,
      userAgent: s.userAgent?.slice(0, 400) ?? null,
      after: { device: label },
    });
    return seen.length > 0;
  });
  if (!alert) return { alerted: false, device: label };

  const [user] = await db.select({ email: schema.user.email, name: schema.user.name }).from(schema.user).where(eq(schema.user.id, s.userId));
  const memberships = await db
    .select({ workspaceId: schema.membership.workspaceId })
    .from(schema.membership)
    .where(and(eq(schema.membership.userId, s.userId), ne(schema.membership.role, "client")));
  const when = formatDateTime(now);
  const title = `Nuevo inicio de sesión: ${label}`;
  const body = `${when}${s.ipAddress ? ` · IP ${s.ipAddress}` : ""}. Si no fuiste vos, cerrá esa sesión en Configuración → Seguridad y cambiá tu contraseña.`;
  if (memberships.length)
    await db
      .insert(schema.notification)
      .values(
        memberships.map((m) => ({
          workspaceId: m.workspaceId,
          userId: s.userId,
          type: "security.new_device",
          title,
          body,
          dedupeKey: `device:${key}`,
        })),
      )
      .onConflictDoNothing();
  if (user && memberships.length)
    await sendEmail({
      to: user.email,
      subject: "AGENCYOS · Nuevo inicio de sesión",
      text: `Hola ${user.name.split(" ")[0]}:\n\nSe inició sesión en tu cuenta desde ${label}.\n${body}\n\nSi fuiste vos, no hace falta hacer nada.`,
    }).catch(() => false);
  return { alerted: true, device: label };
}
