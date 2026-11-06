import { closeDb } from "@agencyos/db";
import { processQueuedAudits } from "./jobs";

/** Despacho manual de la cola de auditorías SEO (mismo código que el job `seo-audit` del worker). */
processQueuedAudits({ budgetMs: Number(process.env.SEO_BUDGET_MS ?? 15 * 60_000) })
  .then(async (r) => {
    console.log(JSON.stringify(r));
    await closeDb();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await closeDb();
    process.exit(1);
  });
