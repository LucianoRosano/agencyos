import { addDays, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { capture } from "@agencyos/modules/inbox/service";
import { createMcpToken, ctxFromToken } from "@agencyos/modules/mcp/tokens";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dailyDueDates, dailySummary, dispatchOutbox } from "../../apps/worker/src/jobs";
import { makeWorkspace } from "./helpers";

describe("worker", () => {
  it("despacha el outbox y notifica lo que hace Claude", async () => {
    const owner = await makeWorkspace();
    const { token } = await createMcpToken(owner, { name: "t" });
    const bot = await ctxFromToken(token);
    if (!bot) throw new Error("token");
    await capture(bot, { text: "Idea desde Claude" }, "mcp");
    await dispatchOutbox();
    const notes = await getDb().select().from(schema.notification).where(eq(schema.notification.workspaceId, owner.workspaceId));
    expect(notes.some((n) => n.title.includes("Idea desde Claude"))).toBe(true);
    const pending = await getDb()
      .select()
      .from(schema.domainEvent)
      .where(and(eq(schema.domainEvent.workspaceId, owner.workspaceId)));
    expect(pending.every((e) => e.dispatchedAt)).toBe(true);
  });

  it("marca vencidos los cobros con fecha pasada y arma el resumen diario", async () => {
    const owner = await makeWorkspace();
    const [c] = await getDb().insert(schema.client).values({ workspaceId: owner.workspaceId, name: "Cliente X", status: "active" }).returning();
    await getDb()
      .insert(schema.receivable)
      .values({
        workspaceId: owner.workspaceId,
        clientId: c?.id as string,
        concept: "Anticipo",
        amount: "1000.00",
        currency: "ARS",
        dueDate: addDays(todayAR(), -2),
      });
    await dailyDueDates();
    const [rec] = await getDb().select().from(schema.receivable).where(eq(schema.receivable.workspaceId, owner.workspaceId));
    expect(rec?.status).toBe("overdue");
    await dailySummary();
    const n = await getDb()
      .select()
      .from(schema.notification)
      .where(and(eq(schema.notification.workspaceId, owner.workspaceId), eq(schema.notification.type, "resumen.diario")));
    expect(n.length).toBe(1);
  });
});
