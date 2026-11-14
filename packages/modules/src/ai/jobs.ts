import { schema } from "@agencyos/db";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../shared/db";
import { executeRun } from "./runner";

/**
 * Job del worker: toma las ejecuciones encoladas (la web solo encola) y las corre una por una.
 * El reclamo usa FOR UPDATE SKIP LOCKED, así que dos workers nunca toman la misma.
 * Con `pollMs` sigue mirando la cola hasta `maxMs` (en producción: casi un minuto, para no esperar al próximo cron).
 */
export async function claimNextRun(): Promise<string | null> {
  const res = await getDb().execute<{ id: string }>(sql`
    update agent_run set status = 'running', started_at = now()
    where id = (
      select id from agent_run where status = 'queued' order by started_at asc limit 1 for update skip locked
    )
    returning id`);
  return res.rows[0]?.id ?? null;
}

/** Ejecuciones "running" huérfanas (el worker se reinició a mitad): se marcan como fallidas. */
export async function failStaleRuns() {
  const rows = await getDb()
    .update(schema.agentRun)
    .set({ status: "failed", errorCode: "interrupted", errorMessage: "El worker se reinició durante la ejecución.", finishedAt: new Date() })
    .where(and(eq(schema.agentRun.status, "running"), sql`${schema.agentRun.startedAt} < now() - interval '15 minutes'`))
    .returning({ id: schema.agentRun.id });
  return rows.length;
}

export async function processAgentRuns(opts: { maxMs?: number; pollMs?: number } = {}) {
  const until = Date.now() + (opts.maxMs ?? 0);
  const stale = await failStaleRuns();
  let processed = 0;
  for (;;) {
    const id = await claimNextRun();
    if (id) {
      await executeRun(id);
      processed++;
      continue;
    }
    if (!opts.pollMs || Date.now() + opts.pollMs >= until) break;
    await new Promise((r) => setTimeout(r, opts.pollMs));
  }
  return { processed, stale };
}
