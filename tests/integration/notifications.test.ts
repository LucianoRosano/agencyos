import { addDays, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { reminderAlerts, taskTimeReminders } from "@agencyos/modules/notifications/jobs";
import { notify } from "@agencyos/modules/notifications/notify";
import {
  archiveNotification,
  flushDeferred,
  listNotifications,
  markAllRead,
  markUnreadMany,
  notificationCounts,
  openNotification,
  snoozeNotification,
  snoozeUntil,
  unreadCount,
  wakeSnoozed,
} from "@agencyos/modules/notifications/service";
import { clockAR, DEFAULT_NOTIFY, inQuietHours, saveNotifySettings } from "@agencyos/modules/notifications/settings";
import { createTask } from "@agencyos/modules/tasks/service";
import { createReminder } from "@agencyos/modules/today/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dispatchOutbox } from "../../apps/worker/src/jobs";
import { makeWorkspace } from "./helpers";

const mineOf = (ws: { workspaceId: string; userId?: string | null }) =>
  getDb()
    .select()
    .from(schema.notification)
    .where(and(eq(schema.notification.workspaceId, ws.workspaceId), eq(schema.notification.userId, ws.userId ?? "")));

describe("avisos: motor, horario de descanso y centro", () => {
  it("horario de descanso: rangos que cruzan la medianoche, fines de semana y apagado", () => {
    const at = (iso: string) => new Date(iso);
    expect(inQuietHours(DEFAULT_NOTIFY, at("2026-11-26T23:30:00-03:00"))).toBe(true);
    expect(inQuietHours(DEFAULT_NOTIFY, at("2026-11-26T07:59:00-03:00"))).toBe(true);
    expect(inQuietHours(DEFAULT_NOTIFY, at("2026-11-26T08:00:00-03:00"))).toBe(false);
    expect(inQuietHours({ ...DEFAULT_NOTIFY, quietEnabled: false }, at("2026-11-26T23:30:00-03:00"))).toBe(false);
    expect(inQuietHours({ ...DEFAULT_NOTIFY, quietWeekends: true }, at("2026-11-28T12:00:00-03:00"))).toBe(true); // sábado
    expect(clockAR(at("2026-11-30T09:15:00-03:00"))).toMatchObject({ date: "2026-11-30", hour: 9, weekday: 1 });
  });

  it("posponer: 1 h, esta tarde, mañana y el lunes a las 9 (hora argentina)", () => {
    const now = new Date("2026-11-26T10:00:00-03:00"); // jueves
    expect(snoozeUntil("1h", now).toISOString()).toBe("2026-11-26T14:00:00.000Z");
    expect(snoozeUntil("tarde", now).toISOString()).toBe("2026-11-26T21:00:00.000Z");
    expect(snoozeUntil("manana", now).toISOString()).toBe("2026-11-27T12:00:00.000Z");
    expect(snoozeUntil("lunes", now).toISOString()).toBe("2026-11-30T12:00:00.000Z");
    expect(snoozeUntil("tarde", new Date("2026-11-26T19:00:00-03:00")).toISOString()).toBe("2026-11-27T21:00:00.000Z");
  });

  it("deduplica, prioriza y difiere el push en el descanso; lo urgente pasa; al terminar se manda junto", async () => {
    const ws = await makeWorkspace();
    await saveNotifySettings(ws.userId ?? "", { ...DEFAULT_NOTIFY, quietEnabled: "on", quietFrom: "00:00", quietTo: "23:59", urgentBypass: "on" });
    const base = { workspaceId: ws.workspaceId, type: "cobro.vencido", entityType: "receivable" };
    expect(await notify({ ...base, title: "Cobro vencido: Anticipo", dedupeKey: "t1" })).toBe(1);
    expect(await notify({ ...base, title: "Cobro vencido: Anticipo", dedupeKey: "t1" })).toBe(0); // dedupe
    await notify({ ...base, type: "sitio.caido", title: "Se cayó lasflores.com.ar", dedupeKey: "t2" });
    await notify({ ...base, type: "resumen.cierre", title: "Buen trabajo", dedupeKey: "t3", priority: "low" });
    const rows = await mineOf(ws);
    const by = Object.fromEntries(rows.map((r) => [r.dedupeKey, r]));
    expect(by.t1).toMatchObject({ priority: "normal", pushState: "deferred" });
    expect(by.t2).toMatchObject({ priority: "urgent", pushState: "sent" });
    expect(by.t3).toMatchObject({ priority: "low", pushState: null });
    // Sigue el descanso: no se manda nada
    expect(await flushDeferred(new Date())).toBe(0);
    // Terminó el descanso
    await saveNotifySettings(ws.userId ?? "", { ...DEFAULT_NOTIFY, quietEnabled: "" });
    await flushDeferred(new Date());
    const after = await mineOf(ws);
    expect(after.find((r) => r.dedupeKey === "t1")?.pushState).toBe("sent");
  });

  it("centro: sin leer, abrir marca leído, todo leído con deshacer, archivar y posponer que vuelve solo", async () => {
    const ws = await makeWorkspace();
    for (const k of ["a", "b", "c"]) await notify({ workspaceId: ws.workspaceId, type: "presupuesto.visto", title: `Visto ${k}`, dedupeKey: k });
    expect(await unreadCount(ws)).toBe(3);
    const [a, b, c] = (await listNotifications(ws, "sin-leer")).sort((x, y) => x.title.localeCompare(y.title));
    expect(await openNotification(ws, a?.id ?? "")).toBe("/hoy");
    expect(await unreadCount(ws)).toBe(2);
    await snoozeNotification(ws, b?.id ?? "", "1h");
    expect(await notificationCounts(ws)).toMatchObject({ unread: 1, snoozed: 1, archived: 0 });
    expect((await listNotifications(ws, "pospuestas")).map((n) => n.id)).toEqual([b?.id]);
    await archiveNotification(ws, c?.id ?? "");
    expect(await notificationCounts(ws)).toMatchObject({ unread: 0, archived: 1 });
    // Vuelve el pospuesto
    expect(await wakeSnoozed(new Date(Date.now() + 2 * 3_600_000))).toBeGreaterThanOrEqual(1);
    expect((await listNotifications(ws, "sin-leer")).map((n) => n.id)).toContain(b?.id);
    const { ids } = await markAllRead(ws);
    expect(await unreadCount(ws)).toBe(0);
    await markUnreadMany(ws, ids);
    expect(await unreadCount(ws)).toBe(ids.length);
    // Otra persona no puede abrir avisos ajenos
    const other = await makeWorkspace();
    expect(await openNotification(other, b?.id ?? "")).toBeNull();
  });

  it("outbox: el cliente abrió el presupuesto → aviso; lo que hace uno mismo no se avisa", async () => {
    const ws = await makeWorkspace();
    const [q] = await getDb()
      .insert(schema.domainEvent)
      .values([
        { workspaceId: ws.workspaceId, type: "presupuesto.visto", entityType: "quote", actorType: "system", payload: {} },
        { workspaceId: ws.workspaceId, type: "presupuesto.aceptado", entityType: "quote", actorType: "user", actorId: ws.userId, payload: {} },
        { workspaceId: ws.workspaceId, type: "objetivo.pregunta", entityType: "goal", actorType: "agent", actorId: "x", payload: {} },
      ])
      .returning();
    expect(q).toBeTruthy();
    while ((await dispatchOutbox()) > 0) {}
    const types = (await mineOf(ws)).map((r) => r.type).sort();
    expect(types).toEqual(["objetivo.pregunta", "presupuesto.visto"]);
  });

  it("vencimientos agendados (N días antes, mañana y hoy) y tareas con hora (15 min antes)", async () => {
    const ws = await makeWorkspace();
    const today = todayAR();
    await createReminder(ws, { title: "Renovar dominio", dueDate: addDays(today, 7), notifyDaysBefore: "7" });
    await createReminder(ws, { title: "Pagar monotributo", dueDate: today, notifyDaysBefore: "3" });
    await createReminder(ws, { title: "Lejano", dueDate: addDays(today, 20), notifyDaysBefore: "7" });
    await reminderAlerts(today);
    await reminderAlerts(today); // idempotente
    const titles = (await mineOf(ws)).map((r) => r.title).sort();
    expect(titles).toEqual([`Vence en 7 días (${addDays(today, 7).split("-").reverse().join("/")}): Renovar dominio`, "Vence hoy: Pagar monotributo"].sort());

    const c = clockAR();
    const inTen = c.minutes + 10;
    if (inTen < 24 * 60) {
      const hhmm = `${String(Math.floor(inTen / 60)).padStart(2, "0")}:${String(inTen % 60).padStart(2, "0")}`;
      await createTask(ws, { title: "Llamar a la imprenta", dueDate: c.date, dueTime: hhmm });
      await taskTimeReminders();
      await taskTimeReminders();
      expect((await mineOf(ws)).filter((r) => r.type === "tarea.recordatorio").map((r) => r.title)).toEqual(["En 10 min: Llamar a la imprenta"]);
    }
  });
});
