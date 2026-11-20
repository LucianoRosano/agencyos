import { assertCan, type Ctx } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";

/**
 * Satisfacción de clientes (encuesta NPS del portal). NPS = % promotores (9–10) − % detractores (0–6).
 */
export function npsOf(scores: number[]) {
  if (!scores.length) return null;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

/** Respuestas de un cliente (la más reciente primero) con el proyecto. */
export async function clientSatisfaction(ctx: Ctx, clientId: string) {
  assertCan(ctx, "read", "crm");
  const rows = await getDb()
    .select({
      score: schema.clientFeedback.score,
      comment: schema.clientFeedback.comment,
      createdAt: schema.clientFeedback.createdAt,
      projectId: schema.clientFeedback.projectId,
      projectName: schema.project.name,
    })
    .from(schema.clientFeedback)
    .leftJoin(schema.project, eq(schema.project.id, schema.clientFeedback.projectId))
    .where(and(scoped(schema.clientFeedback, ctx), eq(schema.clientFeedback.clientId, clientId)))
    .orderBy(desc(schema.clientFeedback.createdAt))
    .limit(20);
  const scores = rows.map((r) => r.score);
  return {
    count: rows.length,
    average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
    nps: npsOf(scores),
    responses: rows,
  };
}

/** NPS del workspace en un rango de fechas (respuestas recibidas). */
export async function npsSummary(ctx: Ctx, range: { start: string; end: string }) {
  assertCan(ctx, "read", "crm");
  const rows = await getDb()
    .select({ score: schema.clientFeedback.score })
    .from(schema.clientFeedback)
    .where(
      and(
        scoped(schema.clientFeedback, ctx),
        gte(schema.clientFeedback.createdAt, new Date(`${range.start}T03:00:00Z`)),
        lte(schema.clientFeedback.createdAt, sql`${`${range.end}T03:00:00Z`}::timestamptz + interval '1 day'`),
      ),
    );
  const scores = rows.map((r) => r.score);
  return { count: scores.length, nps: npsOf(scores) };
}
