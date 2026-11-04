import { assertCan, type Ctx, notFound, zEmail, zInt, zOptText, zPhone, zUrl } from "@agencyos/core";
import { audit } from "@agencyos/core/events";
import { schema } from "@agencyos/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../shared/db";

export const OPTIONAL_MODULES = [
  { key: "inbox", label: "Bandeja", description: "Captura rápida y procesamiento uno por uno." },
  { key: "projects", label: "Proyectos y tareas", description: "Proyectos, plantillas, tareas, modo foco." },
  { key: "crm", label: "CRM", description: "Clientes, contactos, interacciones y oportunidades." },
  { key: "quotes", label: "Presupuestos", description: "Catálogo de servicios, presupuestos con PDF y versiones." },
  { key: "finance", label: "Finanzas", description: "Cuentas, movimientos, suscripciones, por cobrar y por pagar." },
  { key: "notes", label: "Notas", description: "Markdown con [[enlaces]]: el reemplazo de Obsidian." },
  { key: "brain", label: "Cerebro", description: "Grafo de todo lo conectado." },
  { key: "calendar", label: "Calendario", description: "Todas las fechas del sistema en un lugar." },
  { key: "study", label: "Facultad", description: "Materias, evaluaciones y apuntes." },
  { key: "ai", label: "IA / MCP", description: "Servidor MCP para que Claude opere AGENCYOS." },
] as const;

export const workspaceInput = z.object({
  agencyName: zOptText(120),
  agencyEmail: zEmail,
  agencyPhone: zPhone,
  agencyWebsite: zUrl,
  agencyCity: zOptText(120),
  quoteFooter: zOptText(500),
  stalledDays: zInt(3, 90).default(14),
  maxActiveProjects: zInt(1, 50).default(8),
});

export async function updateWorkspaceSettings(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "manage", "settings");
  const input = workspaceInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [before] = await t.select().from(schema.workspace).where(eq(schema.workspace.id, ctx.workspaceId));
    if (!before) throw notFound("El workspace");
    const settings = { ...before.settings, ...input };
    const [row] = await t.update(schema.workspace).set({ settings, updatedAt: new Date() }).where(eq(schema.workspace.id, ctx.workspaceId)).returning();
    await audit(t, ctx, { action: "workspace.settings_updated", targetType: "workspace", targetId: ctx.workspaceId, before: before.settings, after: settings });
    return row;
  });
}

export async function setModules(ctx: Ctx, modules: string[]) {
  assertCan(ctx, "manage", "settings");
  const valid = modules.filter((m) => OPTIONAL_MODULES.some((o) => o.key === m));
  return getDb().transaction(async (t) => {
    const [row] = await t.update(schema.workspace).set({ enabledModules: valid, updatedAt: new Date() }).where(eq(schema.workspace.id, ctx.workspaceId)).returning();
    await audit(t, ctx, { action: "workspace.modules_updated", targetType: "workspace", targetId: ctx.workspaceId, after: { modules: valid } });
    return row;
  });
}

export async function updateProfileName(ctx: Ctx, name: string) {
  if (!ctx.userId) throw notFound("El usuario");
  const n = z.string().trim().min(2, "Ingresá tu nombre").max(80).parse(name);
  const [row] = await getDb().update(schema.user).set({ name: n, updatedAt: new Date() }).where(eq(schema.user.id, ctx.userId)).returning();
  return row;
}

export async function listAudit(ctx: Ctx, opts: { action?: string; limit?: number } = {}) {
  assertCan(ctx, "read", "audit");
  const where = [eq(schema.auditLog.workspaceId, ctx.workspaceId)];
  if (opts.action) where.push(sql`${schema.auditLog.action} like ${`${opts.action}%`}`);
  return getDb().select().from(schema.auditLog).where(and(...where)).orderBy(desc(schema.auditLog.at)).limit(opts.limit ?? 200);
}

/** Estado del sistema: versión, base, cola, outbox pendiente, último backup (marcado por el worker). */
export async function systemStatus(ctx: Ctx) {
  assertCan(ctx, "read", "settings");
  const db = getDb();
  const [dbSize] = (await db.execute<{ size: string; version: string }>(sql`select pg_size_pretty(pg_database_size(current_database())) as size, current_setting('server_version') as version`)).rows;
  const [outbox] = (await db.execute<{ pending: number; oldest: string | null }>(sql`select count(*)::int as pending, min(occurred_at)::text as oldest from domain_event where dispatched_at is null`)).rows;
  let queue: { state: string; n: number }[] = [];
  let failedJobs: { name: string; n: number }[] = [];
  try {
    queue = (await db.execute<{ state: string; n: number }>(sql`select state::text, count(*)::int as n from pgboss.job group by 1 order by 1`)).rows;
    failedJobs = (await db.execute<{ name: string; n: number }>(sql`select name, count(*)::int as n from pgboss.job where state = 'failed' and created_on > now() - interval '7 days' group by 1`)).rows;
  } catch {
    // el worker todavía no creó el esquema de pg-boss
  }
  const [lastBackup] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.action, "backup.completed"), gte(schema.auditLog.at, new Date(Date.now() - 40 * 86_400_000)))).orderBy(desc(schema.auditLog.at)).limit(1);
  const [lastWorker] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "worker.heartbeat")).orderBy(desc(schema.auditLog.at)).limit(1);
  return {
    version: process.env.APP_VERSION ?? "dev",
    node: process.version,
    db: { size: dbSize?.size ?? "—", version: dbSize?.version ?? "—" },
    outbox: { pending: outbox?.pending ?? 0, oldest: outbox?.oldest ?? null },
    queue,
    failedJobs,
    lastBackupAt: lastBackup?.at ?? null,
    workerSeenAt: lastWorker?.at ?? null,
    integrations: { brevo: Boolean(process.env.BREVO_API_KEY) },
  };
}
