import { getDb } from "@agencyos/db";
import { sql } from "drizzle-orm";
import { failStaleAudits, runNextQueuedAudit } from "./crawler";
import { enqueueDueSchedules } from "./service";

/**
 * Jobs del SEO Auditor (registrados en apps/worker/src/registry.ts).
 *
 * Despacho: `startAudit` deja la auditoría en `queued` (la tabla es la cola). El job `seo-audit` corre cada minuto
 * en el worker (pg-boss), marca como fallidas las auditorías colgadas y procesa las de la cola de a una, de la más
 * vieja a la más nueva, hasta agotar la cola o el presupuesto de tiempo de esta corrida. Latencia máxima: ~1 minuto.
 * Despacho manual (operación o e2e): `pnpm --filter @agencyos/modules exec tsx src/seo/cli.ts`.
 */
export async function processQueuedAudits(opts: { budgetMs?: number; max?: number } = {}) {
  const started = Date.now();
  const budget = opts.budgetMs ?? 8 * 60_000;
  const stale = await failStaleAudits();
  let processed = 0;
  while (Date.now() - started < budget && processed < (opts.max ?? 20)) {
    const id = await runNextQueuedAudit();
    if (!id) break;
    processed++;
  }
  return { processed, stale };
}

/** Job diario: encola las auditorías programadas y limpia filas hijas de auditorías purgadas de la papelera. */
export async function dailySeoSchedules() {
  const queued = await enqueueDueSchedules();
  const db = getDb();
  for (const t of ["seo_page", "seo_link", "seo_issue", "seo_lighthouse", "seo_field_metrics"])
    await db.execute(sql.raw(`delete from ${t} x where not exists (select 1 from seo_audit a where a.id = x.audit_id)`));
  return { queued };
}
