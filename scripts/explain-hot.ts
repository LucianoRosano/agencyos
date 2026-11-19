/**
 * Mide las consultas calientes contra la base de volumen (scripts/seed-volumen.ts) — docs/SCALING.md.
 *
 *   DATABASE_URL=postgres://…/agencyos_vol pnpm explain:hot [--json salida.json] [--planes]
 *
 * Para cada caso de uso real (getToday, listTasks, globalSearch, …) captura el SQL que emite Drizzle, mide el tiempo de
 * pared de la función (mediana de 5 corridas, en caliente) y corre `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` de cada
 * consulta. Marca los Seq Scan sobre tablas grandes y las consultas de más de 20 ms.
 */
import { writeFileSync } from "node:fs";
import type { Ctx } from "@agencyos/core";
import { getDb, getPool, schema } from "@agencyos/db";
import { getBrainGraph } from "@agencyos/modules/brain/queries";
import { listClients } from "@agencyos/modules/crm/queries";
import { listTransactions } from "@agencyos/modules/finance/queries";
import { listNotes } from "@agencyos/modules/notes/queries";
import { listNotifications, unreadCount } from "@agencyos/modules/notifications/service";
import { listProjects } from "@agencyos/modules/projects/queries";
import { globalSearch } from "@agencyos/modules/search/service";
import { listAudit } from "@agencyos/modules/settings/service";
import { listTasks } from "@agencyos/modules/tasks/queries";
import { getToday } from "@agencyos/modules/today/queries";
import { asc, eq, isNull } from "drizzle-orm";
import pg from "pg";
import { VOLUME_EMAIL } from "./seed-volumen-const";

process.env.AGENCYOS_ROLE ??= "script";

type Captured = { text: string; values: unknown[] };
let capturing: Captured[] | null = null;
const origQuery = pg.Client.prototype.query;
// biome-ignore lint/suspicious/noExplicitAny: interceptamos la firma sobrecargada de pg.
(pg.Client.prototype as any).query = function (this: pg.Client, ...args: any[]) {
  const cfg = args[0];
  if (capturing && cfg) {
    const text = typeof cfg === "string" ? cfg : cfg.text;
    const values = typeof cfg === "string" ? (args[1] ?? []) : (cfg.values ?? args[1] ?? []);
    if (typeof text === "string" && /^\s*(select|with)/i.test(text)) capturing.push({ text, values });
  }
  // biome-ignore lint/suspicious/noExplicitAny: idem.
  return (origQuery as any).apply(this, args);
};

type PlanNode = { "Node Type": string; "Relation Name"?: string; "Actual Rows"?: number; Plans?: PlanNode[]; "Index Name"?: string };
const BIG = new Set(["task", "activity", "domain_event", "transaction", "note", "notification", "audit_log", "link", "project", "client", "interaction"]);

function walk(n: PlanNode, out: string[]) {
  if (n["Node Type"] === "Seq Scan" && n["Relation Name"] && BIG.has(n["Relation Name"]))
    out.push(`Seq Scan ${n["Relation Name"]} (${n["Actual Rows"]} filas)`);
  for (const c of n.Plans ?? []) walk(c, out);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

async function main() {
  const db = getDb();
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, VOLUME_EMAIL));
  if (!u) throw new Error("Falta la base de volumen: corré pnpm seed:volumen");
  const [m] = await db.select().from(schema.membership).where(eq(schema.membership.userId, u.id));
  if (!m) throw new Error("membresía");
  const ctx: Ctx = { workspaceId: m.workspaceId, userId: u.id, role: "owner", actor: { type: "user", id: u.id, name: u.name } };

  const cases: [string, () => Promise<unknown>][] = [
    ["Hoy (getToday)", () => getToday(ctx, { userId: u.id })],
    ["Tareas · todas abiertas", () => listTasks(ctx, { view: "todas" })],
    ["Tareas · hoy", () => listTasks(ctx, { view: "hoy" })],
    ["Tareas · completadas", () => listTasks(ctx, { view: "completadas" })],
    ["Proyectos", () => listProjects(ctx, {})],
    ["Clientes", () => listClients(ctx, {})],
    ["Movimientos", () => listTransactions(ctx, {})],
    ["Notas", () => listNotes(ctx, {})],
    ["Búsqueda global 'diseño'", () => globalSearch(ctx, "diseño")],
    ["Búsqueda global 'nota 123'", () => globalSearch(ctx, "nota 123")],
    ["Cerebro (grafo)", () => getBrainGraph(ctx, {})],
    ["Notificaciones", () => listNotifications(ctx)],
    ["No leídas", () => unreadCount(ctx)],
    ["Auditoría", () => listAudit(ctx, {})],
    [
      "Outbox (pendientes)",
      () => db.select().from(schema.domainEvent).where(isNull(schema.domainEvent.dispatchedAt)).orderBy(asc(schema.domainEvent.occurredAt)).limit(500),
    ],
    [
      "Actividad del proyecto",
      async () => {
        const [a] = await getPool()
          .query("select entity_id from activity where workspace_id = $1 limit 1", [ctx.workspaceId])
          .then((r) => r.rows);
        const { listActivity } = await import("@agencyos/modules/activity/queries");
        return listActivity(ctx, { entityType: "project", entityId: a?.entity_id });
      },
    ],
    ["Actividad del workspace", async () => (await import("@agencyos/modules/activity/queries")).listActivity(ctx, {})],
  ];

  const showPlans = process.argv.includes("--planes");
  const report: { name: string; wallMs: number; queries: { ms: number; sql: string; flags: string[] }[] }[] = [];
  for (const [name, fn] of cases) {
    await fn(); // en caliente
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const s = performance.now();
      await fn();
      times.push(performance.now() - s);
    }
    capturing = [];
    await fn();
    const captured = capturing;
    capturing = null;
    const queries: { ms: number; sql: string; flags: string[] }[] = [];
    for (const c of captured) {
      const r = await getPool().query(`explain (analyze, buffers, format json) ${c.text}`, c.values);
      const plan = r.rows[0]["QUERY PLAN"][0];
      const flags: string[] = [];
      walk(plan.Plan, flags);
      const ms = plan["Execution Time"] + plan["Planning Time"];
      queries.push({ ms, sql: c.text.replace(/\s+/g, " ").slice(0, 160), flags });
      if (showPlans && (ms > 20 || flags.length)) {
        const t = await getPool().query(`explain (analyze, buffers) ${c.text}`, c.values);
        console.log(`\n--- ${name} (${ms.toFixed(1)} ms)\n${c.text}\n${t.rows.map((x) => x["QUERY PLAN"]).join("\n")}`);
      }
    }
    queries.sort((a, b) => b.ms - a.ms);
    report.push({ name, wallMs: median(times), queries });
  }

  console.log("\n| Caso | Pared (mediana) | Consultas | Más lenta (EXPLAIN) | Seq Scan en tablas grandes |");
  console.log("|---|---:|---:|---:|---|");
  for (const r of report) {
    const flags = [...new Set(r.queries.flatMap((q) => q.flags))];
    console.log(`| ${r.name} | ${r.wallMs.toFixed(1)} ms | ${r.queries.length} | ${(r.queries[0]?.ms ?? 0).toFixed(1)} ms | ${flags.join("; ") || "—"} |`);
  }
  const slow = report.flatMap((r) => r.queries.filter((q) => q.ms > 20).map((q) => ({ caso: r.name, ...q })));
  if (slow.length) {
    console.log("\nConsultas > 20 ms:");
    for (const s of slow) console.log(`- [${s.caso}] ${s.ms.toFixed(1)} ms · ${s.sql}`);
  }
  const jsonArg = process.argv.indexOf("--json");
  if (jsonArg > 0 && process.argv[jsonArg + 1]) writeFileSync(process.argv[jsonArg + 1] as string, JSON.stringify(report, null, 2));
}

main()
  .then(() => getPool().end())
  .catch(async (e) => {
    console.error(e);
    await getPool().end();
    process.exit(1);
  });
