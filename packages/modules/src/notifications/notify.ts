import { getDb, schema, type Tx } from "@agencyos/db";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { channelsFor, sendPush } from "../push/service";
import { sendEmail } from "../shared/email";
import { entityHref } from "../shared/entities";
import { defaultPriority, type Priority } from "./catalog";
import { getNotifySettings, inQuietHours } from "./settings";

/**
 * Motor único de avisos. Todos los módulos y jobs notifican por acá:
 * - respeta las preferencias por tipo y canal (app, push, email);
 * - en horario de descanso el push no suena: queda «diferido» y se manda junto al terminar (salvo lo urgente);
 * - deduplica por persona (`dedupeKey`): reintentos y jobs repetidos no duplican;
 * - prioridad «low» = solo en la app (y email si se pidió), nunca push.
 */
export type NotifyInput = {
  workspaceId: string;
  /** Destinatarios; por defecto, dueño y administradores activos del workspace. */
  userIds?: string[];
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  url?: string | null;
  dedupeKey: string;
  priority?: Priority;
  /** Clave de preferencias (por defecto, el tipo). */
  prefKey?: string;
};

type Db = ReturnType<typeof getDb> | Tx;

export async function ownersOf(workspaceId: string, db: Db = getDb()) {
  const rows = await db
    .select({ userId: schema.membership.userId })
    .from(schema.membership)
    .where(and(eq(schema.membership.workspaceId, workspaceId), inArray(schema.membership.role, ["owner", "admin"]), eq(schema.membership.status, "active")));
  return rows.map((r) => r.userId);
}

export const notificationUrl = (n: { url?: string | null; entityType?: string | null; entityId?: string | null; type: string }) =>
  n.url ?? (n.entityType && n.entityId ? entityHref(n.entityType, n.entityId) : n.type.startsWith("security.") ? "/configuracion/seguridad" : "/hoy");

/** Crea el aviso para cada destinatario y lo manda por los canales que correspondan. Devuelve cuántos se crearon. */
export async function notify(n: NotifyInput, db: Db = getDb()): Promise<number> {
  const users = n.userIds ?? (await ownersOf(n.workspaceId, db));
  const priority = n.priority ?? defaultPriority(n.type);
  const title = n.title.slice(0, 200);
  const url = notificationUrl(n);
  let created = 0;
  for (const userId of users) {
    const ch = await channelsFor(userId, n.prefKey ?? n.type);
    const settings = await getNotifySettings(userId);
    const wantsPush = ch.push && priority !== "low";
    const quiet = wantsPush && inQuietHours(settings) && !(priority === "urgent" && settings.urgentBypass);
    let id: string | null = null;
    if (ch.inApp) {
      const [row] = await db
        .insert(schema.notification)
        .values({
          workspaceId: n.workspaceId,
          userId,
          type: n.type,
          title,
          body: n.body?.slice(0, 500) ?? null,
          entityType: n.entityType ?? null,
          entityId: n.entityId ?? null,
          url: n.url ?? null,
          dedupeKey: n.dedupeKey,
          priority,
          pushState: wantsPush ? (quiet ? "deferred" : "sent") : null,
        })
        .onConflictDoNothing()
        .returning({ id: schema.notification.id });
      if (!row) continue; // ya avisado (mismo dedupeKey)
      id = row.id;
      created++;
    }
    if (wantsPush && !quiet) {
      const [unread] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.notification)
        .where(
          and(
            eq(schema.notification.userId, userId),
            eq(schema.notification.workspaceId, n.workspaceId),
            isNull(schema.notification.readAt),
            isNull(schema.notification.archivedAt),
            or(isNull(schema.notification.snoozedUntil), lte(schema.notification.snoozedUntil, sql`now()`)),
          ),
        );
      await sendPush(n.workspaceId, userId, {
        badge: unread?.n ?? undefined,
        title: priority === "urgent" ? `⚠ ${title}` : title,
        body: n.body ?? undefined,
        url: id ? `/notificaciones/abrir/${id}` : url,
        tag: n.dedupeKey.slice(0, 60),
        id: id ?? undefined,
        urgent: priority === "urgent",
      }).catch(() => 0);
    }
    if (ch.email) {
      const [u] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, userId));
      if (u)
        await sendEmail({
          to: u.email,
          subject: `AGENCYOS · ${title}`,
          text: `${title}${n.body ? `\n\n${n.body}` : ""}\n\nAbrir: ${process.env.APP_URL ?? ""}${url}`,
        }).catch(() => undefined);
    }
  }
  return created;
}
