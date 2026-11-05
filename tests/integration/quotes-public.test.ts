import { addDays, todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { createPublicLink, decidePublicQuote, openPublicQuote, revokePublicLink } from "@agencyos/modules/quotes/public";
import { createQuote, markSent } from "@agencyos/modules/quotes/service";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

const today = todayAR();

async function sentQuote() {
  const ctx = await makeWorkspace();
  const [c] = await getDb().insert(schema.client).values({ workspaceId: ctx.workspaceId, name: "Cliente público", status: "prospect" }).returning();
  const q = await createQuote(ctx, {
    clientId: c?.id,
    title: "Sitio institucional",
    currency: "ARS",
    issueDate: today,
    validUntil: addDays(today, 15),
    items: [{ description: "Sitio", quantity: "1", unitPrice: "200000" }],
    paymentPlan: {
      kind: "milestones",
      items: [
        { label: "Anticipo", percent: 50 },
        { label: "Entrega", percent: 50, offsetDays: 30 },
      ],
    },
  });
  await markSent(ctx, q.id);
  return { ctx, q };
}

describe("enlace público de presupuestos", () => {
  it("el cliente abre (queda «visto») y acepta: proyecto + 2 cobros + decisión registrada", async () => {
    const { ctx, q } = await sentQuote();
    const { token } = await createPublicLink(ctx, q.id);
    const opened = await openPublicQuote(token);
    expect(opened?.quote.status).toBe("viewed");
    await expect(decidePublicQuote(token, { decision: "accepted", signerName: "Ana Gómez" }, {})).rejects.toThrow(/condiciones/);
    await decidePublicQuote(token, { decision: "accepted", signerName: "Ana Gómez", agree: "on" }, { ip: "190.1.2.3", userAgent: "test" });
    const [after] = await getDb().select().from(schema.quote).where(eq(schema.quote.id, q.id));
    expect(after?.status).toBe("accepted");
    expect(after?.projectId).toBeTruthy();
    const recs = await getDb().select().from(schema.receivable).where(eq(schema.receivable.quoteId, q.id));
    expect(recs.length).toBe(2);
    const [dec] = await getDb().select().from(schema.quoteDecision).where(eq(schema.quoteDecision.quoteId, q.id));
    expect(dec?.signerName).toBe("Ana Gómez");
    expect(dec?.ip).toBe("190.1.2.3");
    await expect(decidePublicQuote(token, { decision: "rejected", signerName: "Otro" }, {})).rejects.toThrow();
  });

  it("un token revocado, vencido o inventado no abre nada", async () => {
    const { ctx, q } = await sentQuote();
    const { token } = await createPublicLink(ctx, q.id);
    await revokePublicLink(ctx, q.id);
    expect(await openPublicQuote(token)).toBeNull();
    expect(await openPublicQuote("x".repeat(43))).toBeNull();
    const { token: t2 } = await createPublicLink(ctx, q.id);
    await getDb()
      .update(schema.quote)
      .set({ publicExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.quote.id, q.id));
    expect(await openPublicQuote(t2)).toBeNull();
  });
});
