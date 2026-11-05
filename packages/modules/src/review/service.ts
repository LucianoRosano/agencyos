import { addDays, assertCan, type Ctx, isoWeek, todayAR, validation } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { getDb, schema } from "@agencyos/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { createNoteInTx } from "../notes/service";
import { scoped } from "../shared/db";
import { getToday } from "../today/queries";

/** Semana ISO "2026-W45" de una fecha. */
export function weekKey(date = todayAR()) {
  const w = isoWeek(date);
  // el año ISO puede diferir del calendario en los bordes
  const thursday = addDays(date, 3 - ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
  return `${thursday.slice(0, 4)}-W${String(w).padStart(2, "0")}`;
}

export async function getWeeklyReviewData(ctx: Ctx) {
  if (!ctx.userId) throw validation("Sin usuario");
  const week = weekKey();
  const today = await getToday(ctx, { userId: ctx.userId });
  const [existing] = await getDb()
    .select()
    .from(schema.weeklyReview)
    .where(and(scoped(schema.weeklyReview, ctx), eq(schema.weeklyReview.userId, ctx.userId), eq(schema.weeklyReview.week, week)));
  return {
    week,
    weekNumber: isoWeek(todayAR()),
    inbox: today.counts.inbox,
    noNextAction: today.catchUp.filter((c) => c.kind === "project_no_action"),
    stalled: today.catchUp.filter((c) => c.kind === "project_stalled"),
    catchUp: today.catchUp.filter((c) => !["project_no_action", "project_stalled", "inbox"].includes(c.kind)),
    money: today.money,
    projects: today.projects
      .filter((p) => p.status === "in_progress")
      .map((p) => ({ id: p.id, name: p.name, nextAction: p.nextAction, clientName: p.clientName })),
    existing: existing ?? null,
  };
}

export const reviewInput = z.object({
  wins: z.string().trim().max(5000).optional(),
  blockers: z.string().trim().max(5000).optional(),
  focuses: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
  moneyNote: z.string().trim().max(2000).optional(),
});

/** Cierra la revisión: guarda las respuestas y genera la nota «Revisión S##» (queda en el Cerebro). */
export async function completeWeeklyReview(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "note");
  if (!ctx.userId) throw validation("Sin usuario");
  const input = reviewInput.parse(raw);
  const data = await getWeeklyReviewData(ctx);
  const title = `Revisión S${String(data.weekNumber).padStart(2, "0")} · ${data.week.slice(0, 4)}`;
  const body = [
    `# ${title}`,
    "",
    `- Bandeja al cerrar: ${data.inbox} ítems`,
    `- Proyectos en curso: ${data.projects.length}`,
    `- Pendientes de "Ponerse al día": ${data.catchUp.length}`,
    "",
    "## Focos de la semana",
    ...(input.focuses.length ? input.focuses.map((f, i) => `${i + 1}. ${f}`) : ["(sin focos elegidos)"]),
    "",
    "## Lo que salió bien",
    input.wins || "—",
    "",
    "## Lo que trabó",
    input.blockers || "—",
    "",
    "## Dinero",
    input.moneyNote || "—",
    "",
    "## Proyectos en curso",
    ...data.projects.map((p) => `- #${p.name}${p.nextAction ? ` → ${p.nextAction}` : " → (sin siguiente acción)"}`),
  ].join("\n");
  const userId = ctx.userId;
  return getDb().transaction(async (t) => {
    const note = await createNoteInTx(t, ctx, { title, bodyMd: body, folderPath: "Revisiones" });
    const values = { workspaceId: ctx.workspaceId, userId, week: data.week, completedAt: new Date(), noteId: note.id, answers: input, createdBy: userId };
    if (data.existing) await t.update(schema.weeklyReview).set(values).where(eq(schema.weeklyReview.id, data.existing.id));
    else await t.insert(schema.weeklyReview).values(values);
    await recordEvent(t, ctx, { type: "revision.semanal_completada", entityType: "note", entityId: note.id, summary: `Completó la ${title}` });
    return note;
  });
}
