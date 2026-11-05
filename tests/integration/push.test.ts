import { getDb, schema } from "@agencyos/db";
import { capture } from "@agencyos/modules/inbox/service";
import { createMcpToken, ctxFromToken } from "@agencyos/modules/mcp/tokens";
import { publicVapidKey, savePushSubscription, setPreference } from "@agencyos/modules/push/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dispatchOutbox } from "../../apps/worker/src/jobs";
import { makeWorkspace } from "./helpers";

describe("notificaciones push y preferencias", () => {
  it("genera las claves VAPID una sola vez y guarda la privada cifrada", async () => {
    const ctx = await makeWorkspace();
    const k1 = await publicVapidKey(ctx);
    const k2 = await publicVapidKey(ctx);
    expect(k1).toBe(k2);
    const [row] = await getDb()
      .select()
      .from(schema.integration)
      .where(and(eq(schema.integration.workspaceId, ctx.workspaceId), eq(schema.integration.provider, "webpush")));
    expect(row?.secretEnc?.length).toBeGreaterThan(60);
    expect(JSON.stringify(row?.config)).not.toContain("private");
  });

  it("rechaza suscripciones sin https y respeta «no avisar en la app»", async () => {
    const ctx = await makeWorkspace();
    await expect(savePushSubscription(ctx, { endpoint: "http://x.test/push", keys: { p256dh: "a".repeat(20), auth: "b".repeat(10) } })).rejects.toThrow();
    await setPreference(ctx, "agente.actividad", { inApp: false, push: false, email: false });
    const { token } = await createMcpToken(ctx, { name: "t" });
    const bot = await ctxFromToken(token);
    if (!bot) throw new Error("token");
    await capture(bot, { text: "Desde Claude, sin aviso" }, "mcp");
    await dispatchOutbox();
    const n = await getDb().select().from(schema.notification).where(eq(schema.notification.workspaceId, ctx.workspaceId));
    expect(n.length).toBe(0);
  });
});
