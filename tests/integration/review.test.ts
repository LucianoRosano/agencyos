import { getDb, schema } from "@agencyos/db";
import { createProject } from "@agencyos/modules/projects/service";
import { completeWeeklyReview, getWeeklyReviewData, weekKey } from "@agencyos/modules/review/service";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeWorkspace } from "./helpers";

describe("revisión semanal", () => {
  it("genera la nota «Revisión S##» y se puede rehacer en la misma semana", async () => {
    const ctx = await makeWorkspace();
    await createProject(ctx, { name: "Proyecto sin acción", status: "planning" });
    const d = await getWeeklyReviewData(ctx);
    expect(d.noNextAction.length).toBe(1);
    const note = await completeWeeklyReview(ctx, { focuses: ["Cerrar la tienda"], wins: "Avancé AGENCYOS" });
    expect(note.title).toMatch(/^Revisión S\d{2}/);
    expect(note.bodyMd).toContain("Cerrar la tienda");
    const again = await completeWeeklyReview(ctx, { focuses: [] });
    expect(again.title).toMatch(/\(2\)$/);
    const rows = await getDb().select().from(schema.weeklyReview).where(eq(schema.weeklyReview.workspaceId, ctx.workspaceId));
    expect(rows.length).toBe(1);
    expect(rows[0]?.week).toBe(weekKey());
  });
  it("semana ISO en el borde de año", () => {
    expect(weekKey("2027-01-01")).toBe("2026-W53");
    expect(weekKey("2026-11-05")).toBe("2026-W45");
  });
});
