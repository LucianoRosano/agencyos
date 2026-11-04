import { can, type Ctx } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, asc, desc, eq, gte, inArray, ne, or, type SQL, sql } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";

const OPEN = ["new", "contacted", "meeting", "proposal_sent", "negotiation"];

export type ClientFilters = { status?: string; q?: string; spaceId?: string };

/** Lista de clientes con contacto principal y oportunidades abiertas. "archived" solo si se pide. */
export async function listClients(ctx: Ctx, f: ClientFilters = {}) {
  const db = getDb();
  const where: SQL[] = [scoped(schema.client, ctx)];
  if (f.status) where.push(eq(schema.client.status, f.status));
  else where.push(ne(schema.client.status, "archived"));
  if (f.spaceId) where.push(eq(schema.client.spaceId, f.spaceId));
  if (f.q) {
    where.push(
      sql`f_search_norm(coalesce(${schema.client.name},'') || ' ' || coalesce(${schema.client.tradeName},'') || ' ' || coalesce(${schema.client.industry},'') || ' ' || coalesce(${schema.client.city},'')) like '%' || f_search_norm(${f.q}) || '%'`,
    );
  }
  return db
    .select({
      c: schema.client,
      primaryContact: sql<string | null>`(select ct.name from client_contact cc join contact ct on ct.id = cc.contact_id and ct.deleted_at is null where cc.client_id = "client"."id" order by cc.is_primary desc, ct.name limit 1)`,
      openOpps: sql<number>`(select count(*)::int from opportunity o where o.client_id = "client"."id" and o.deleted_at is null and o.stage in ('new','contacted','meeting','proposal_sent','negotiation'))`,
      activeProjects: sql<number>`(select count(*)::int from project p where p.client_id = "client"."id" and p.deleted_at is null and p.archived_at is null and p.status not in ('done','archived'))`,
    })
    .from(schema.client)
    .where(and(...where))
    .orderBy(desc(schema.client.lastActivityAt), asc(schema.client.name))
    .limit(500);
}

/** Conteo por estado (chips de filtro). */
export async function clientStatusCounts(ctx: Ctx, spaceId?: string) {
  const where: SQL[] = [scoped(schema.client, ctx)];
  if (spaceId) where.push(eq(schema.client.spaceId, spaceId));
  const rows = await getDb()
    .select({ status: schema.client.status, n: sql<number>`count(*)::int` })
    .from(schema.client)
    .where(and(...where))
    .groupBy(schema.client.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

export async function clientOptions(ctx: Ctx) {
  return getDb()
    .select({ id: schema.client.id, name: schema.client.name })
    .from(schema.client)
    .where(and(scoped(schema.client, ctx), ne(schema.client.status, "archived")))
    .orderBy(asc(schema.client.name));
}

export async function mergeCandidates(ctx: Ctx, exceptId: string) {
  return getDb()
    .select({ id: schema.client.id, name: schema.client.name })
    .from(schema.client)
    .where(and(scoped(schema.client, ctx), ne(schema.client.id, exceptId)))
    .orderBy(asc(schema.client.name));
}

export async function contactsOfClient(ctx: Ctx, clientId: string) {
  return getDb()
    .select({ ct: schema.contact, isPrimary: schema.clientContact.isPrimary, roleInClient: schema.clientContact.roleInClient })
    .from(schema.clientContact)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.clientContact.contactId))
    .where(and(eq(schema.clientContact.clientId, clientId), eq(schema.clientContact.workspaceId, ctx.workspaceId), scoped(schema.contact, ctx)))
    .orderBy(desc(schema.clientContact.isPrimary), asc(schema.contact.name));
}

/** Presupuestos con el total de su versión vigente. */
function quotesQuery(ctx: Ctx, where: SQL) {
  return getDb()
    .select({
      id: schema.quote.id,
      number: schema.quote.number,
      title: schema.quote.title,
      status: schema.quote.status,
      clientId: schema.quote.clientId,
      opportunityId: schema.quote.opportunityId,
      sentAt: schema.quote.sentAt,
      createdAt: schema.quote.createdAt,
      total: schema.quoteVersion.total,
      currency: schema.quoteVersion.currency,
    })
    .from(schema.quote)
    .leftJoin(schema.quoteVersion, eq(schema.quoteVersion.id, schema.quote.currentVersionId))
    .where(and(scoped(schema.quote, ctx), where))
    .orderBy(desc(schema.quote.createdAt));
}

export type QuoteOption = Awaited<ReturnType<typeof quotesQuery>>[number];

export const quotesOfClient = (ctx: Ctx, clientId: string) => quotesQuery(ctx, eq(schema.quote.clientId, clientId));

/** Presupuestos de varios clientes (para vincular desde el kanban). */
export async function quotesOfClients(ctx: Ctx, clientIds: string[]) {
  if (!clientIds.length) return [];
  return quotesQuery(ctx, and(inArray(schema.quote.clientId, clientIds), ne(schema.quote.status, "void")) as SQL);
}

/** Dinero del cliente por moneda, sin convertir: cobrado (ingresos) y por cobrar (pendientes). */
export async function clientMoney(ctx: Ctx, clientId: string) {
  const db = getDb();
  const [collected, pending, receivables] = await Promise.all([
    db
      .select({ currency: schema.transaction.currency, total: sql<string>`sum(${schema.transaction.amount})::numeric(14,2)::text`, n: sql<number>`count(*)::int` })
      .from(schema.transaction)
      .where(and(scoped(schema.transaction, ctx), eq(schema.transaction.clientId, clientId), eq(schema.transaction.kind, "income")))
      .groupBy(schema.transaction.currency),
    db
      .select({ currency: schema.receivable.currency, total: sql<string>`sum(${schema.receivable.amount} - ${schema.receivable.paidAmount})::numeric(14,2)::text`, n: sql<number>`count(*)::int` })
      .from(schema.receivable)
      .where(and(scoped(schema.receivable, ctx), eq(schema.receivable.clientId, clientId), inArray(schema.receivable.status, ["pending", "partial", "overdue"])))
      .groupBy(schema.receivable.currency),
    db
      .select()
      .from(schema.receivable)
      .where(and(scoped(schema.receivable, ctx), eq(schema.receivable.clientId, clientId), inArray(schema.receivable.status, ["pending", "partial", "overdue"])))
      .orderBy(asc(schema.receivable.dueDate))
      .limit(50),
  ]);
  return { collected, pending, receivables };
}

/** Actividad del cliente y de sus oportunidades (una sola línea de tiempo). */
export async function clientActivity(ctx: Ctx, clientId: string, oppIds: string[], limit = 100) {
  const a = schema.activity;
  const cond = oppIds.length
    ? or(and(eq(a.entityType, "client"), eq(a.entityId, clientId)), and(eq(a.entityType, "opportunity"), inArray(a.entityId, oppIds)))
    : and(eq(a.entityType, "client"), eq(a.entityId, clientId));
  return getDb()
    .select()
    .from(a)
    .where(and(eq(a.workspaceId, ctx.workspaceId), cond))
    .orderBy(desc(a.occurredAt))
    .limit(limit);
}

/** Ficha 360° del cliente. Los datos fiscales NO vienen acá (solo su cantidad). */
export async function getClient(ctx: Ctx, id: string) {
  const db = getDb();
  const [row] = await db
    .select({ c: schema.client, spaceName: schema.space.name, spaceColor: schema.space.color })
    .from(schema.client)
    .leftJoin(schema.space, eq(schema.space.id, schema.client.spaceId))
    .where(and(eq(schema.client.id, id), scoped(schema.client, ctx, { withArchived: true })));
  if (!row) return null;
  const [contacts, interactions, opportunities, projects, quotes, fiscal] = await Promise.all([
    contactsOfClient(ctx, id),
    db
      .select({ i: schema.interaction, contactName: schema.contact.name })
      .from(schema.interaction)
      .leftJoin(schema.contact, eq(schema.contact.id, schema.interaction.contactId))
      .where(and(eq(schema.interaction.clientId, id), scoped(schema.interaction, ctx)))
      .orderBy(desc(schema.interaction.occurredAt))
      .limit(200),
    db.select().from(schema.opportunity).where(and(eq(schema.opportunity.clientId, id), scoped(schema.opportunity, ctx))).orderBy(desc(schema.opportunity.createdAt)),
    db
      .select()
      .from(schema.project)
      .where(and(eq(schema.project.clientId, id), scoped(schema.project, ctx, { withArchived: true })))
      .orderBy(desc(schema.project.lastActivityAt)),
    quotesOfClient(ctx, id),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.clientFiscalHolder)
      .where(and(eq(schema.clientFiscalHolder.clientId, id), scoped(schema.clientFiscalHolder, ctx))),
  ]);
  return { ...row, contacts, interactions, opportunities, projects, quotes, fiscalCount: fiscal[0]?.n ?? 0, canSeeFiscal: can(ctx, "read", "fiscal"), canSeeMoney: can(ctx, "read", "finance") };
}

export type ContactFilters = { q?: string };

export async function listContacts(ctx: Ctx, f: ContactFilters = {}) {
  const where: SQL[] = [scoped(schema.contact, ctx)];
  if (f.q) where.push(sql`f_search_norm(coalesce(${schema.contact.name},'') || ' ' || coalesce(${schema.contact.email},'') || ' ' || coalesce(${schema.contact.role},'')) like '%' || f_search_norm(${f.q}) || '%'`);
  return getDb()
    .select({
      ct: schema.contact,
      clients: sql<{ id: string; name: string; isPrimary: boolean }[]>`coalesce((select json_agg(json_build_object('id', c.id, 'name', c.name, 'isPrimary', cc.is_primary) order by c.name) from client_contact cc join client c on c.id = cc.client_id and c.deleted_at is null where cc.contact_id = "contact"."id"), '[]'::json)`,
    })
    .from(schema.contact)
    .where(and(...where))
    .orderBy(asc(schema.contact.name))
    .limit(500);
}

export async function contactOptions(ctx: Ctx) {
  return getDb().select({ id: schema.contact.id, name: schema.contact.name, email: schema.contact.email }).from(schema.contact).where(scoped(schema.contact, ctx)).orderBy(asc(schema.contact.name));
}

export async function getContact(ctx: Ctx, id: string) {
  const db = getDb();
  const [ct] = await db.select().from(schema.contact).where(and(eq(schema.contact.id, id), scoped(schema.contact, ctx)));
  if (!ct) return null;
  const [clients, interactions] = await Promise.all([
    db
      .select({ id: schema.client.id, name: schema.client.name, status: schema.client.status, isPrimary: schema.clientContact.isPrimary, roleInClient: schema.clientContact.roleInClient })
      .from(schema.clientContact)
      .innerJoin(schema.client, eq(schema.client.id, schema.clientContact.clientId))
      .where(and(eq(schema.clientContact.contactId, id), eq(schema.clientContact.workspaceId, ctx.workspaceId), scoped(schema.client, ctx, { withArchived: true })))
      .orderBy(asc(schema.client.name)),
    db
      .select({ i: schema.interaction, clientName: schema.client.name })
      .from(schema.interaction)
      .innerJoin(schema.client, eq(schema.client.id, schema.interaction.clientId))
      .where(and(eq(schema.interaction.contactId, id), scoped(schema.interaction, ctx)))
      .orderBy(desc(schema.interaction.occurredAt))
      .limit(100),
  ]);
  return { ct, clients, interactions };
}

export type OpportunityFilters = { q?: string; clientId?: string; stage?: string; closedDays?: number };

/** Oportunidades abiertas + cerradas en los últimos `closedDays` días (90 por defecto). */
export async function listOpportunities(ctx: Ctx, f: OpportunityFilters = {}) {
  const o = schema.opportunity;
  const where: SQL[] = [scoped(o, ctx)];
  if (f.stage) where.push(eq(o.stage, f.stage));
  if (f.clientId) where.push(eq(o.clientId, f.clientId));
  if (f.q) where.push(sql`f_search_norm(${o.title} || ' ' || coalesce(${schema.client.name},'')) like '%' || f_search_norm(${f.q}) || '%'`);
  const since = new Date(Date.now() - (f.closedDays ?? 90) * 86_400_000);
  where.push(or(inArray(o.stage, OPEN), and(eq(o.stage, "won"), gte(o.wonAt, since)), and(eq(o.stage, "lost"), gte(o.lostAt, since))) as SQL);
  return getDb()
    .select({ o, clientName: schema.client.name, clientStatus: schema.client.status })
    .from(o)
    .innerJoin(schema.client, eq(schema.client.id, o.clientId))
    .where(and(...where, scoped(schema.client, ctx, { withArchived: true })))
    .orderBy(asc(o.sort), desc(o.createdAt))
    .limit(500);
}

export async function getOpportunity(ctx: Ctx, id: string) {
  const db = getDb();
  const [row] = await db
    .select({ o: schema.opportunity, clientName: schema.client.name, clientStatus: schema.client.status })
    .from(schema.opportunity)
    .innerJoin(schema.client, eq(schema.client.id, schema.opportunity.clientId))
    .where(and(eq(schema.opportunity.id, id), scoped(schema.opportunity, ctx)));
  if (!row) return null;
  const [quotes, activity] = await Promise.all([
    quotesOfClient(ctx, row.o.clientId),
    db
      .select()
      .from(schema.activity)
      .where(and(eq(schema.activity.workspaceId, ctx.workspaceId), eq(schema.activity.entityType, "opportunity"), eq(schema.activity.entityId, id)))
      .orderBy(desc(schema.activity.occurredAt))
      .limit(100),
  ]);
  return { ...row, quotes, linkedQuotes: quotes.filter((q) => q.opportunityId === id), activity };
}

/** Próximos pasos del cliente: acciones de oportunidades abiertas y de interacciones pendientes. */
export function nextStepsOf(data: NonNullable<Awaited<ReturnType<typeof getClient>>>) {
  const steps: { key: string; text: string; due: string | null; href: string; source: string; interactionId?: string }[] = [];
  for (const o of data.opportunities) {
    if (OPEN.includes(o.stage) && o.nextAction) steps.push({ key: `o-${o.id}`, text: o.nextAction, due: o.nextActionDue, href: `/crm/oportunidades/${o.id}`, source: `Oportunidad «${o.title}»` });
  }
  for (const { i } of data.interactions) {
    if (i.nextStep) steps.push({ key: `i-${i.id}`, text: i.nextStep, due: i.nextStepDue, href: `/crm/clientes/${i.clientId}/interacciones`, source: "Conversación", interactionId: i.id });
  }
  return steps.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}

