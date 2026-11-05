import { todayAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, eq, isNull, lt, lte, sql } from "drizzle-orm";
import { getDb } from "../shared/db";
import { lastMatchBetween, MAX_ATTEMPTS } from "./engine";
import { executeRule, resumeRun, ruleSource } from "./runner";
import { scheduledTrigger, sourceItems } from "./service";

/** Ventana hacia atrás para no perder un horario si el worker estuvo caído unos minutos. */
const WINDOW_MS = 15 * 60_000;

/** Reglas programadas: corre cada minuto; idempotente por (regla, horario) o (regla, elemento, versión). */
export async function runScheduledRules(now = new Date()) {
  const db = getDb();
  const rules = await db
    .select()
    .from(schema.automationRule)
    .where(
      and(
        eq(schema.automationRule.active, true),
        eq(schema.automationRule.triggerKind, "schedule"),
        isNull(schema.automationRule.deletedAt),
        isNull(schema.automationRule.archivedAt),
      ),
    );
  let runs = 0;
  for (const rule of rules) {
    if (!rule.cron) continue;
    try {
      const from = new Date(Math.max(now.getTime() - WINDOW_MS, rule.createdAt.getTime()));
      const slot = lastMatchBetween(rule.cron, from, now);
      if (!slot) continue;
      const src = ruleSource(rule);
      if (!src) {
        const r = await executeRule(rule, scheduledTrigger(rule, slot), { dryRun: rule.testMode });
        if (!r.duplicate) runs++;
        continue;
      }
      for (const item of await sourceItems(rule.workspaceId, src, todayAR(now))) {
        const r = await executeRule(rule, scheduledTrigger(rule, slot, item), { dryRun: rule.testMode });
        if (!r.duplicate) runs++;
      }
    } catch (e) {
      console.error("[automatizaciones] programada", rule.id, e instanceof Error ? e.message : e);
    }
  }
  return runs;
}

/** Retoma ejecuciones en "esperar N días" cuyo plazo venció. Cada fila se reclama de forma atómica. */
export async function resumeWaitingRuns(now = new Date()) {
  const db = getDb();
  const due = await db
    .select({ id: schema.automationRun.id })
    .from(schema.automationRun)
    .where(and(eq(schema.automationRun.status, "waiting"), lte(schema.automationRun.resumeAt, now)))
    .limit(100);
  let n = 0;
  for (const { id } of due) {
    const [run] = await db
      .update(schema.automationRun)
      .set({ status: "running" })
      .where(and(eq(schema.automationRun.id, id), eq(schema.automationRun.status, "waiting")))
      .returning();
    if (!run) continue;
    try {
      await resumeRun(run);
      n++;
    } catch (e) {
      await db
        .update(schema.automationRun)
        .set({ status: "failed", error: e instanceof Error ? e.message : String(e), finishedAt: new Date() })
        .where(eq(schema.automationRun.id, id));
    }
  }
  return n;
}

/** Reintentos con espera exponencial (2, 4, 8, 16 min) para fallas transitorias (red, servicio externo). */
export async function retryFailedRuns(now = new Date()) {
  const db = getDb();
  const due = await db
    .select({ id: schema.automationRun.id })
    .from(schema.automationRun)
    .where(
      and(
        eq(schema.automationRun.status, "failed"),
        eq(schema.automationRun.dryRun, false),
        lt(schema.automationRun.attempt, MAX_ATTEMPTS),
        sql`(${schema.automationRun.output} ->> 'retryable') = 'true'`,
        sql`${schema.automationRun.finishedAt} + (power(2, ${schema.automationRun.attempt}) * interval '1 minute') <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .limit(50);
  let n = 0;
  for (const { id } of due) {
    const [run] = await db
      .update(schema.automationRun)
      .set({ status: "running", attempt: sql`${schema.automationRun.attempt} + 1` })
      .where(and(eq(schema.automationRun.id, id), eq(schema.automationRun.status, "failed")))
      .returning();
    if (!run) continue;
    try {
      await resumeRun(run);
      n++;
    } catch (e) {
      await db
        .update(schema.automationRun)
        .set({ status: "failed", error: e instanceof Error ? e.message : String(e), finishedAt: new Date() })
        .where(eq(schema.automationRun.id, id));
    }
  }
  return n;
}

/** Job del worker (cada minuto). */
export async function automationsTick(now = new Date()) {
  const scheduled = await runScheduledRules(now);
  const resumed = await resumeWaitingRuns(now);
  const retried = await retryFailedRuns(now);
  return { scheduled, resumed, retried };
}
