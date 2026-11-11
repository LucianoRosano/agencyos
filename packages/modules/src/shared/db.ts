import { type Ctx, forbidden, notFound } from "@agencyos/core";
import { type DbOrTx, getDb, schema, type Tx } from "@agencyos/db";
import { and, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

export { getDb };

type Scoped = { workspaceId: PgColumn; deletedAt?: PgColumn; archivedAt?: PgColumn };

/** Filtro obligatorio por workspace (+ excluye papelera por defecto). */
export function scoped(table: Scoped, ctx: Pick<Ctx, "workspaceId">, opts: { withDeleted?: boolean; withArchived?: boolean } = {}): SQL {
  const parts: SQL[] = [eq(table.workspaceId, ctx.workspaceId)];
  if (!opts.withDeleted && table.deletedAt) parts.push(isNull(table.deletedAt));
  if (!opts.withArchived && table.archivedAt) parts.push(isNull(table.archivedAt));
  return and(...parts) as SQL;
}

export async function tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(fn);
}

export type { DbOrTx, Tx };

/**
 * Verifica que un id recibido del cliente pertenezca al workspace (y no esté en la papelera).
 * Las tablas de negocio no tienen FKs: esta verificación es la barrera de aislamiento al escribir.
 */
export async function assertOwned(
  db: DbOrTx,
  ctx: Pick<Ctx, "workspaceId">,
  // biome-ignore lint/suspicious/noExplicitAny: tabla genérica con id/workspaceId/deletedAt
  table: PgTable & { id: any; workspaceId: any; deletedAt?: any },
  id: string | null | undefined,
  what: string,
): Promise<void> {
  if (!id) return;
  // biome-ignore lint/suspicious/noExplicitAny: select genérico
  const [row] = await (db as any)
    .select({ id: table.id })
    .from(table)
    .where(and(scoped(table, ctx, { withArchived: true }), eq(table.id, id)))
    .limit(1);
  if (!row) throw notFound(what);
}

// --- Alcance por proyecto (F6 · colaboradores y clientes) ---

type ScopeCtx = Pick<Ctx, "workspaceId" | "userId" | "role" | "actor">;

/**
 * `member` (colaborador) solo ve los proyectos asignados en `project_member` y lo que cuelga de ellos.
 * `client` nunca usa las consultas internas (tiene su portal): para él el alcance interno es vacío.
 * Dueño, admin y sistema: sin restricción. Un agente (MCP) hereda el rol de quien creó el token.
 */
export function isProjectScoped(ctx: Pick<Ctx, "role" | "actor">): boolean {
  return ctx.actor.type !== "system" && (ctx.role === "member" || ctx.role === "client");
}

/** Subconsulta con los ids de proyecto asignados al usuario del contexto. */
function assignedProjectIds(ctx: Pick<Ctx, "workspaceId" | "userId">) {
  return getDb()
    .select({ id: schema.projectMember.projectId })
    .from(schema.projectMember)
    .where(and(eq(schema.projectMember.workspaceId, ctx.workspaceId), eq(schema.projectMember.userId, ctx.userId ?? "")));
}

/**
 * Filtro centralizado por proyecto. Devuelve `undefined` (sin filtro) para roles completos;
 * para `member`, `columna IN (proyectos asignados)`; para `client`, `false`.
 * Uso: `.where(and(scoped(schema.task, ctx), projectScope(ctx, schema.task.projectId)))`.
 */
export function projectScope(ctx: ScopeCtx, column: PgColumn = schema.project.id): SQL | undefined {
  if (!isProjectScoped(ctx)) return undefined;
  if (ctx.role === "client" || !ctx.userId) return sql`false`;
  return inArray(column, assignedProjectIds(ctx));
}

/** Igual que projectScope pero para columnas que apuntan a un sitio (site_id). */
export function siteScope(ctx: ScopeCtx, column: PgColumn): SQL | undefined {
  if (!isProjectScoped(ctx)) return undefined;
  if (ctx.role === "client" || !ctx.userId) return sql`false`;
  return inArray(
    column,
    getDb()
      .select({ id: schema.site.id })
      .from(schema.site)
      .where(and(eq(schema.site.workspaceId, ctx.workspaceId), inArray(schema.site.projectId, assignedProjectIds(ctx)))),
  );
}

/** Rechaza la operación para roles con alcance por proyecto (administración del proyecto, CRM, etc.). */
export function assertFullAccess(ctx: Pick<Ctx, "role" | "actor">, msg?: string): void {
  if (isProjectScoped(ctx)) throw forbidden(msg);
}

/**
 * Verifica que el usuario tenga acceso al proyecto (escrituras). Para roles completos no hace nada
 * (la pertenencia al workspace se sigue verificando con scoped/assertOwned). Un proyecto ajeno responde 404.
 */
export async function assertProjectAccess(db: DbOrTx, ctx: Ctx, projectId: string | null | undefined): Promise<void> {
  if (!isProjectScoped(ctx)) return;
  if (!projectId) throw forbidden("Como colaborador, trabajás dentro de tus proyectos asignados.");
  if (ctx.role === "client" || !ctx.userId) throw notFound("El proyecto");
  const [row] = await db
    .select({ id: schema.projectMember.id })
    .from(schema.projectMember)
    .innerJoin(schema.project, eq(schema.project.id, schema.projectMember.projectId))
    .where(
      and(
        eq(schema.projectMember.workspaceId, ctx.workspaceId),
        eq(schema.projectMember.userId, ctx.userId),
        eq(schema.projectMember.projectId, projectId),
        eq(schema.project.workspaceId, ctx.workspaceId),
        isNull(schema.project.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw notFound("El proyecto");
}

/** Proyecto del que cuelga una entidad. `undefined` = tipo fuera del alcance de un colaborador. */
export async function projectOfEntity(db: DbOrTx, ctx: Pick<Ctx, "workspaceId">, type: string, id: string): Promise<string | null | undefined> {
  const ws = ctx.workspaceId;
  const one = async (q: SQL) => {
    const r = await db.execute<{ project_id: string | null }>(q);
    return r.rows[0] ? (r.rows[0].project_id ?? null) : null;
  };
  const viaSite = (table: string) =>
    one(
      sql`select s.project_id from ${sql.identifier(table)} x join site s on s.id = x.site_id and s.workspace_id = x.workspace_id where x.id = ${id} and x.workspace_id = ${ws}`,
    );
  switch (type) {
    case "project":
      return one(sql`select id as project_id from project where id = ${id} and workspace_id = ${ws}`);
    case "task":
    case "deliverable":
    case "decision":
    case "file":
    case "site":
      return one(sql`select project_id from ${sql.identifier(type)} where id = ${id} and workspace_id = ${ws}`);
    case "site_requirement":
    case "site_environment":
      return viaSite(type);
    default:
      return undefined;
  }
}

/** Acceso de un colaborador a una entidad genérica (comentarios, etiquetas, papelera). Fuera de su alcance: 404. */
export async function assertEntityAccess(db: DbOrTx, ctx: Ctx, type: string, id: string): Promise<void> {
  if (!isProjectScoped(ctx)) return;
  const projectId = await projectOfEntity(db, ctx, type, id);
  if (projectId === undefined) throw forbidden();
  if (!projectId) throw notFound("El elemento");
  await assertProjectAccess(db, ctx, projectId);
}
