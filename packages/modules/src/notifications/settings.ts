import { getDb, schema } from "@agencyos/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

/**
 * Ajustes de avisos por persona (user_preference «notify»): horario de descanso, hora del resumen diario,
 * cierre del día y resumen semanal. Lo urgente (sitio caído, acceso desde un dispositivo nuevo) puede saltear el descanso.
 */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:MM)");
const bool = z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean());

export const notifySettingsInput = z.object({
  quietEnabled: bool,
  quietFrom: hhmm.default("22:00"),
  quietTo: hhmm.default("08:00"),
  quietWeekends: bool,
  urgentBypass: bool,
  digestHour: z.coerce.number().int().min(5).max(12).default(8),
  eveningRecap: bool,
  recapHour: z.coerce.number().int().min(16).max(23).default(19),
  weeklyDigest: bool,
});
export type NotifySettings = z.infer<typeof notifySettingsInput>;

export const DEFAULT_NOTIFY: NotifySettings = {
  quietEnabled: true,
  quietFrom: "22:00",
  quietTo: "08:00",
  quietWeekends: false,
  urgentBypass: true,
  digestHour: 8,
  eveningRecap: false,
  recapHour: 19,
  weeklyDigest: true,
};

export async function getNotifySettings(userId: string): Promise<NotifySettings> {
  const [row] = await getDb()
    .select({ value: schema.userPreference.value })
    .from(schema.userPreference)
    .where(and(eq(schema.userPreference.userId, userId), eq(schema.userPreference.key, "notify")));
  return { ...DEFAULT_NOTIFY, ...((row?.value as Partial<NotifySettings>) ?? {}) };
}

export async function saveNotifySettings(userId: string, raw: unknown) {
  const value = notifySettingsInput.parse(raw);
  await getDb()
    .insert(schema.userPreference)
    .values({ userId, key: "notify", value })
    .onConflictDoUpdate({ target: [schema.userPreference.userId, schema.userPreference.key], set: { value, updatedAt: new Date() } });
  return value;
}

/** Fecha, minutos del día y día de la semana (1 = lunes … 7 = domingo) en hora argentina. */
export function clockAR(d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday ?? "") + 1;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), hour: Number(parts.hour), weekday };
}

const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** ¿Es horario de descanso para esta persona? (rangos que cruzan la medianoche incluidos). */
export function inQuietHours(s: NotifySettings, d = new Date()) {
  const c = clockAR(d);
  if (s.quietWeekends && (c.weekday === 6 || c.weekday === 7)) return true;
  if (!s.quietEnabled) return false;
  const from = toMin(s.quietFrom);
  const to = toMin(s.quietTo);
  if (from === to) return false;
  return from < to ? c.minutes >= from && c.minutes < to : c.minutes >= from || c.minutes < to;
}
