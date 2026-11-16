import { addMoney, assertCan, type Ctx, notFound, subMoney } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { signedFileUrl } from "../library/queries";
import { fileScope, filesOfProjectsSql, getDb, isProjectScoped, projectScope, scoped } from "../shared/db";

/**
 * Lo que «cuelga» de un proyecto y no es del módulo Proyectos: notas, archivos de la Biblioteca,
 * finanzas y ficha del cliente. Lo usan la ficha del proyecto (pestañas Notas, Archivos, Finanzas, Cliente)
 * para cualquier rol; para un colaborador es la única vía de acceso a esos datos (siempre dentro de sus
 * proyectos asignados; finanzas y CRM además exigen los permisos extra de core/permissions).
 */

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** El proyecto existe en el workspace y el contexto lo puede ver (colaborador: asignado). Si no, 404. */
async function visibleProject(ctx: Ctx, projectId: string) {
  assertCan(ctx, "read", "project");
  if (!isUuid(projectId)) throw notFound("El proyecto");
  const [p] = await getDb()
    .select({ id: schema.project.id, clientId: schema.project.clientId, name: schema.project.name })
    .from(schema.project)
    .where(and(eq(schema.project.id, projectId), scoped(schema.project, ctx, { withArchived: true }), projectScope(ctx)));
  if (!p) throw notFound("El proyecto");
  return p;
}

// --- Notas ---

/** Notas del proyecto: pertenecen a él (entity_type = 'project') o están vinculadas (link en cualquier sentido). */
function noteOfProject(ctx: Pick<Ctx, "workspaceId">, projectId: string) {
  const ws = ctx.workspaceId;
  return sql`((${schema.note.entityType} = 'project' and ${schema.note.entityId} = ${projectId})
    or ${schema.note.id} in (select l.from_id from link l where l.workspace_id = ${ws} and l.from_type = 'note' and l.to_type = 'project' and l.to_id = ${projectId})
    or ${schema.note.id} in (select l.to_id from link l where l.workspace_id = ${ws} and l.from_type = 'project' and l.from_id = ${projectId} and l.to_type = 'note'))`;
}

/** Roles completos necesitan además el permiso de notas; el colaborador accede solo vía su proyecto. */
function assertNotesRead(ctx: Ctx) {
  if (!isProjectScoped(ctx)) assertCan(ctx, "read", "note");
}

export async function listProjectNotes(ctx: Ctx, projectId: string) {
  assertNotesRead(ctx);
  const p = await visibleProject(ctx, projectId);
  return getDb()
    .select({
      id: schema.note.id,
      title: schema.note.title,
      excerpt: sql<string>`left(regexp_replace(${schema.note.bodyMd}, '^---[\\s\\S]*?---\\s*', ''), 220)`,
      wordCount: schema.note.wordCount,
      updatedAt: schema.note.updatedAt,
      owned: sql<boolean>`(${schema.note.entityType} = 'project' and ${schema.note.entityId} = ${p.id})`,
    })
    .from(schema.note)
    .where(and(scoped(schema.note, ctx), noteOfProject(ctx, p.id)))
    .orderBy(desc(schema.note.updatedAt))
    .limit(200);
}

/** Una nota del proyecto (404 si no está vinculada a él). */
export async function getProjectNote(ctx: Ctx, projectId: string, noteId: string) {
  assertNotesRead(ctx);
  const p = await visibleProject(ctx, projectId);
  if (!isUuid(noteId)) return null;
  const [n] = await getDb()
    .select()
    .from(schema.note)
    .where(and(eq(schema.note.id, noteId), scoped(schema.note, ctx), noteOfProject(ctx, p.id)));
  return n ?? null;
}

/** Verificación para escribir (notes/service.updateProjectNote). */
export async function assertNoteOfProject(ctx: Ctx, projectId: string, noteId: string) {
  const n = await getProjectNote(ctx, projectId, noteId);
  if (!n) throw notFound("La nota");
  return n;
}

// --- Archivos ---

export async function listProjectFiles(ctx: Ctx, projectId: string) {
  const p = await visibleProject(ctx, projectId);
  const rows = await getDb()
    .select({
      id: schema.file.id,
      name: schema.file.name,
      mime: schema.file.mime,
      kind: schema.file.kind,
      size: schema.file.size,
      version: schema.file.currentVersion,
      thumbKey: schema.file.thumbKey,
      createdAt: schema.file.createdAt,
    })
    .from(schema.file)
    .where(and(scoped(schema.file, ctx), filesOfProjectsSql(ctx.workspaceId, sql`(select ${p.id}::uuid)`), fileScope(ctx)))
    .orderBy(desc(schema.file.createdAt))
    .limit(300);
  return rows.map(({ thumbKey, ...f }) => ({
    ...f,
    thumbUrl: thumbKey ? signedFileUrl(f.id, { thumb: true, v: f.version }) : null,
    downloadUrl: signedFileUrl(f.id, { v: f.version, dl: true }),
  }));
}

// --- Finanzas (permiso extra «project_finance» para colaboradores) ---

export async function projectFinance(ctx: Ctx, projectId: string) {
  assertCan(ctx, "read", "project_finance");
  const p = await visibleProject(ctx, projectId);
  const db = getDb();
  const [receivables, transactions] = await Promise.all([
    db
      .select({
        id: schema.receivable.id,
        concept: schema.receivable.concept,
        amount: schema.receivable.amount,
        paidAmount: schema.receivable.paidAmount,
        currency: schema.receivable.currency,
        dueDate: schema.receivable.dueDate,
        status: schema.receivable.status,
      })
      .from(schema.receivable)
      .where(and(scoped(schema.receivable, ctx), eq(schema.receivable.projectId, p.id)))
      .orderBy(sql`${schema.receivable.dueDate} asc nulls last`)
      .limit(200),
    db
      .select({
        id: schema.transaction.id,
        date: schema.transaction.date,
        kind: schema.transaction.kind,
        amount: schema.transaction.amount,
        currency: schema.transaction.currency,
        description: schema.transaction.description,
      })
      .from(schema.transaction)
      .where(and(scoped(schema.transaction, ctx), eq(schema.transaction.projectId, p.id), inArray(schema.transaction.kind, ["income", "expense"])))
      .orderBy(desc(schema.transaction.date))
      .limit(200),
  ]);
  const totals = new Map<string, { currency: string; income: string; expense: string; pending: string }>();
  const tot = (c: string) => {
    let t = totals.get(c);
    if (!t) totals.set(c, (t = { currency: c, income: "0", expense: "0", pending: "0" }));
    return t;
  };
  for (const tx of transactions) {
    const t = tot(tx.currency);
    if (tx.kind === "income") t.income = addMoney(t.income, tx.amount);
    else t.expense = addMoney(t.expense, tx.amount);
  }
  for (const r of receivables) {
    if (r.status === "void" || r.status === "paid") continue;
    const t = tot(r.currency);
    t.pending = addMoney(t.pending, subMoney(r.amount, r.paidAmount));
  }
  return { receivables, transactions, totals: [...totals.values()] };
}

// --- Cliente (permiso extra «project_crm» para colaboradores) ---

export async function projectClientCard(ctx: Ctx, projectId: string) {
  assertCan(ctx, "read", "project_crm");
  const p = await visibleProject(ctx, projectId);
  if (!p.clientId) return null;
  const db = getDb();
  const [c] = await db
    .select({
      id: schema.client.id,
      name: schema.client.name,
      tradeName: schema.client.tradeName,
      industry: schema.client.industry,
      website: schema.client.website,
      city: schema.client.city,
      province: schema.client.province,
      status: schema.client.status,
      notesMd: schema.client.notesMd,
    })
    .from(schema.client)
    .where(and(eq(schema.client.id, p.clientId), scoped(schema.client, ctx, { withArchived: true })));
  if (!c) return null;
  const [contacts, interactions] = await Promise.all([
    db
      .select({
        id: schema.contact.id,
        name: schema.contact.name,
        role: schema.clientContact.roleInClient,
        email: schema.contact.email,
        phone: schema.contact.phone,
        whatsapp: schema.contact.whatsapp,
        isPrimary: schema.clientContact.isPrimary,
      })
      .from(schema.clientContact)
      .innerJoin(schema.contact, and(eq(schema.contact.id, schema.clientContact.contactId), eq(schema.contact.workspaceId, schema.clientContact.workspaceId)))
      .where(and(eq(schema.clientContact.workspaceId, ctx.workspaceId), eq(schema.clientContact.clientId, c.id), scoped(schema.contact, ctx)))
      .orderBy(desc(schema.clientContact.isPrimary), schema.contact.name),
    db
      .select({
        id: schema.interaction.id,
        kind: schema.interaction.kind,
        occurredAt: schema.interaction.occurredAt,
        summaryMd: schema.interaction.summaryMd,
        nextStep: schema.interaction.nextStep,
      })
      .from(schema.interaction)
      .where(and(scoped(schema.interaction, ctx), eq(schema.interaction.clientId, c.id)))
      .orderBy(desc(schema.interaction.occurredAt))
      .limit(15),
  ]);
  return { client: c, contacts, interactions };
}
