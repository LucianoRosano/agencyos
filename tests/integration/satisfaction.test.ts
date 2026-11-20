import { todayAR } from "@agencyos/core";
import { getDb, schema } from "@agencyos/db";
import { clientSatisfaction, npsOf, npsSummary } from "@agencyos/modules/crm/satisfaction";
import { answerSurvey, type PortalCtx, pendingSurveys } from "@agencyos/modules/portal/service";
import { createProject, setProjectStatus } from "@agencyos/modules/projects/service";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dispatchOutbox } from "../../apps/worker/src/jobs";
import { makeWorkspace } from "./helpers";

async function setup() {
  const owner = await makeWorkspace();
  const [mine] = await getDb().insert(schema.client).values({ workspaceId: owner.workspaceId, name: "Panadería Sol", status: "active" }).returning();
  const [other] = await getDb().insert(schema.client).values({ workspaceId: owner.workspaceId, name: "Otro", status: "active" }).returning();
  if (!mine || !other) throw new Error("clientes");
  const userId = `u_client_${Math.random().toString(36).slice(2)}`;
  await getDb()
    .insert(schema.user)
    .values({ id: userId, name: "Sofía Sol", email: `${userId}@test.local`, emailVerified: true });
  await getDb().insert(schema.membership).values({ workspaceId: owner.workspaceId, userId, role: "client" });
  const pc: PortalCtx = { workspaceId: owner.workspaceId, userId, role: "client", actor: { type: "user", id: userId, name: "Sofía Sol" }, clientId: mine.id };
  return { owner, mine, other, pc };
}

describe("encuesta de satisfacción (NPS)", () => {
  it("npsOf: promotores − detractores", () => {
    expect(npsOf([])).toBeNull();
    expect(npsOf([10, 9, 8, 6])).toBe(25);
    expect(npsOf([0, 3, 10])).toBe(-33);
  });

  it("al terminar un proyecto el cliente lo califica una vez; le llega al dueño y se ve en la ficha", async () => {
    const { owner, mine, other, pc } = await setup();
    const p = await createProject(owner, { name: "Web Sol", clientId: mine.id, kind: "website" });
    const pOther = await createProject(owner, { name: "Web Otro", clientId: other.id, kind: "website" });
    expect(await pendingSurveys(pc)).toEqual([]); // en planificación: todavía no
    await expect(answerSurvey(pc, p.id, { score: 9 })).rejects.toThrow(/terminado/);
    await setProjectStatus(owner, p.id, "done");
    await setProjectStatus(owner, pOther.id, "done");
    expect((await pendingSurveys(pc)).map((x) => x.id)).toEqual([p.id]); // solo los suyos
    await expect(answerSurvey(pc, pOther.id, { score: 10 })).rejects.toThrow();
    await expect(answerSurvey(pc, p.id, { score: 11 })).rejects.toThrow();
    await answerSurvey(pc, p.id, { score: "9", comment: "Muy claros con los tiempos" });
    await expect(answerSurvey(pc, p.id, { score: 3 })).rejects.toThrow(/Ya calificaste/);
    expect(await pendingSurveys(pc)).toEqual([]);

    for (let i = 0; i < 50 && (await dispatchOutbox()) > 0; i++);
    const notes = await getDb()
      .select()
      .from(schema.notification)
      .where(and(eq(schema.notification.workspaceId, owner.workspaceId), eq(schema.notification.userId, owner.userId ?? "")));
    expect(notes.some((n) => n.type === "satisfaccion.respondida" && n.title.includes("9/10"))).toBe(true);

    const s = await clientSatisfaction(owner, mine.id);
    expect(s).toMatchObject({ count: 1, average: 9, nps: 100 });
    expect(s.responses[0]).toMatchObject({ comment: "Muy claros con los tiempos", projectName: "Web Sol" });
    const today = todayAR();
    expect(await npsSummary(owner, { start: today, end: today })).toEqual({ count: 1, nps: 100 });
    // aislamiento: otro workspace no ve nada
    const b = await makeWorkspace("B");
    expect((await clientSatisfaction(b, mine.id)).count).toBe(0);
  });
});
