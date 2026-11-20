import { deviceLabel } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { recordLoginDevice } from "@agencyos/modules/auth/devices";
import { listNotifications } from "@agencyos/modules/notifications/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("alerta de inicio de sesión desde un dispositivo nuevo", () => {
  it("el primero es el alta (sin aviso); uno nuevo avisa una sola vez; uno conocido no", async () => {
    const ws = await makeWorkspace();
    const uid = ws.userId as string;
    expect(deviceLabel(ANDROID_CHROME)).toBe("Chrome · Android");
    expect(deviceLabel(IPHONE)).toBe("Safari · iOS");
    expect((await recordLoginDevice({ userId: uid, userAgent: MAC_CHROME, ipAddress: "1.2.3.4" })).alerted).toBe(false);
    expect((await recordLoginDevice({ userId: uid, userAgent: MAC_CHROME })).alerted).toBe(false);
    // dos ingresos simultáneos desde el mismo dispositivo nuevo: un solo aviso
    const [a, b] = await Promise.all([
      recordLoginDevice({ userId: uid, userAgent: ANDROID_CHROME, ipAddress: "5.6.7.8" }),
      recordLoginDevice({ userId: uid, userAgent: ANDROID_CHROME, ipAddress: "5.6.7.8" }),
    ]);
    expect([a.alerted, b.alerted].filter(Boolean)).toHaveLength(1);
    const n = await listNotifications(ws);
    expect(n.filter((x) => x.type === "security.new_device").map((x) => x.title)).toEqual(["Nuevo inicio de sesión: Chrome · Android"]);
    expect(n[0]?.body).toContain("IP 5.6.7.8");
    const devices = await getDb()
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.actorId, uid), eq(schema.auditLog.action, "auth.device")));
    expect(devices.map((d) => d.targetId).sort()).toEqual(["chrome · android", "chrome · macos"]);
  });

  it("un cliente del portal queda registrado pero no recibe avisos", async () => {
    const ws = await makeWorkspace();
    const uid = ws.userId as string;
    await getDb().update(schema.membership).set({ role: "client" }).where(eq(schema.membership.userId, uid));
    await recordLoginDevice({ userId: uid, userAgent: MAC_CHROME });
    expect((await recordLoginDevice({ userId: uid, userAgent: IPHONE })).alerted).toBe(true);
    expect(await listNotifications(ws)).toEqual([]);
  });
});
