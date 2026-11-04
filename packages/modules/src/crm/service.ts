import {
  assertCan, type Ctx, conflict, formatCuit, L, label, notFound, todayAR, validation,
  zBool, zCuit, zCurrency, zEmail, zInt, zOptDate, zOptMoney, zOptText, zOptTime, zOptUuid, zPhone, zRequired, zUrl, zUuid,
} from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { schema, type Tx } from "@agencyos/db";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, scoped } from "../shared/db";

export const CLIENT_STATUSES = ["prospect", "active", "paused", "finished", "archived"] as const;
export const RELATIONSHIPS = ["family", "referral", "external"] as const;
export const INTERACTION_KINDS = ["whatsapp", "call", "email", "meeting", "message", "note"] as const;
export const STAGES = ["new", "contacted", "meeting", "proposal_sent", "negotiation", "won", "lost"] as const;
export const OPEN_STAGES = ["new", "contacted", "meeting", "proposal_sent", "negotiation"] as const;
export const LOST_REASONS = ["price", "time", "competitor", "no_answer", "other"] as const;
/** Condiciones frente al IVA (ARCA). Los textos viven en components/crm/labels.ts. */
export const VAT_CONDITIONS = ["responsable_inscripto", "monotributo", "exento", "consumidor_final", "no_responsable"] as const;

export type Stage = (typeof STAGES)[number];
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

const now = () => new Date();

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export const clientInput = z.object({
  name: zRequired(160, "El nombre"),
  tradeName: zOptText(160),
  industry: zOptText(120),
  website: zUrl,
  city: zOptText(120),
  province: zOptText(120),
  relationship: z.enum(RELATIONSHIPS, { error: "Relación inválida" }).default("external"),
  status: z.enum(CLIENT_STATUSES, { error: "Estado inválido" }).default("prospect"),
  source: zOptText(120),
  spaceId: zOptUuid,
  notesMd: zOptText(50000),
});

/** Alta con contacto principal opcional (flujo rápido de "Nuevo cliente"). */
export const newClientInput = clientInput.extend({
  contactName: zOptText(160),
  contactRole: zOptText(120),
  contactEmail: zEmail,
  contactPhone: zPhone,
});

async function agencySpace(t: Tx, ctx: Ctx) {
  const spaces = await t.select().from(schema.space).where(scoped(schema.space, ctx)).orderBy(asc(schema.space.sort));
  const pick = spaces.find((s) => s.kind === "agency") ?? spaces[0];
  if (!pick) throw notFound("El espacio");
  return pick.id;
}

async function getClientRow(t: Tx, ctx: Ctx, id: string) {
  const [c] = await t.select().from(schema.client).where(and(eq(schema.client.id, id), scoped(schema.client, ctx, { withArchived: true })));
  if (!c) throw notFound("El cliente");
  return c;
}

async function assertSpace(t: Tx, ctx: Ctx, spaceId: string) {
  const [s] = await t.select({ id: schema.space.id }).from(schema.space).where(and(eq(schema.space.id, spaceId), scoped(schema.space, ctx)));
  if (!s) throw validation("El espacio no existe", { spaceId: "Elegí un espacio válido" });
}

const touchClient = (t: Tx, clientId: string) => t.update(schema.client).set({ lastActivityAt: now() }).where(eq(schema.client.id, clientId));

export async function createClient(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "crm");
  const input = newClientInput.parse(raw);
  if (!input.contactName && (input.contactEmail || input.contactPhone || input.contactRole)) {
    throw validation("Falta el nombre del contacto", { contactName: "El nombre del contacto es obligatorio" });
  }
  return getDb().transaction(async (t) => {
    if (input.spaceId) await assertSpace(t, ctx, input.spaceId);
    const spaceId = input.spaceId ?? (await agencySpace(t, ctx));
    const { contactName, contactRole, contactEmail, contactPhone, ...fields } = input;
    const [row] = await t
      .insert(schema.client)
      .values({ ...fields, spaceId, workspaceId: ctx.workspaceId, createdBy: ctx.userId, lastActivityAt: now() })
      .returning();
    if (!row) throw new Error("No se pudo crear el cliente");
    if (contactName) {
      const [c] = await t
        .insert(schema.contact)
        .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, name: contactName, role: contactRole, email: contactEmail, phone: contactPhone, whatsapp: contactPhone })
        .returning();
      if (c) await t.insert(schema.clientContact).values({ workspaceId: ctx.workspaceId, clientId: row.id, contactId: c.id, isPrimary: true, roleInClient: contactRole });
    }
    await recordEvent(t, ctx, { type: "cliente.creado", entityType: "client", entityId: row.id, summary: `Creó el cliente «${row.name}»${contactName ? ` con el contacto ${contactName}` : ""}` });
    return row;
  });
}

export async function updateClient(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "crm");
  const input = clientInput.parse(raw);
  return getDb().transaction(async (t) => {
    const before = await getClientRow(t, ctx, id);
    if (input.spaceId) await assertSpace(t, ctx, input.spaceId);
    const [row] = await t
      .update(schema.client)
      .set({
        name: input.name,
        tradeName: input.tradeName ?? null,
        industry: input.industry ?? null,
        website: input.website ?? null,
        city: input.city ?? null,
        province: input.province ?? null,
        relationship: input.relationship,
        status: input.status,
        source: input.source ?? null,
        spaceId: input.spaceId ?? before.spaceId,
        notesMd: input.notesMd ?? null,
        lastActivityAt: now(),
      })
      .where(eq(schema.client.id, id))
      .returning();
    if (!row) throw notFound("El cliente");
    const statusChanged = before.status !== row.status;
    await recordEvent(t, ctx, {
      type: statusChanged ? "cliente.estado_cambiado" : "cliente.actualizado",
      entityType: "client",
      entityId: id,
      summary: statusChanged ? `Pasó a «${row.name}» de ${label(L.clientStatus, before.status).toLowerCase()} a ${label(L.clientStatus, row.status).toLowerCase()}` : `Editó el cliente «${row.name}»`,
      payload: statusChanged ? { from: before.status, to: row.status } : undefined,
    });
    return row;
  });
}

async function changeStatus(t: Tx, ctx: Ctx, id: string, status: ClientStatus) {
  const before = await getClientRow(t, ctx, id);
  if (before.status === status) return before;
  const [row] = await t.update(schema.client).set({ status, lastActivityAt: now() }).where(eq(schema.client.id, id)).returning();
  await recordEvent(t, ctx, {
    type: "cliente.estado_cambiado",
    entityType: "client",
    entityId: id,
    summary: `Pasó a «${before.name}» de ${label(L.clientStatus, before.status).toLowerCase()} a ${label(L.clientStatus, status).toLowerCase()}`,
    payload: { from: before.status, to: status },
  });
  return row ?? before;
}

export async function setClientStatus(ctx: Ctx, id: string, status: string) {
  assertCan(ctx, "update", "crm");
  const s = z.enum(CLIENT_STATUSES, { error: "Estado inválido" }).parse(status);
  return getDb().transaction((t) => changeStatus(t, ctx, id, s));
}

/** Proyectos (no eliminados) del cliente: base de la decisión al eliminarlo. */
async function clientProjectIds(t: Tx, ctx: Ctx, clientId: string) {
  const rows = await t
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(and(eq(schema.project.clientId, clientId), scoped(schema.project, ctx, { withArchived: true })));
  return rows.map((r) => r.id);
}

/**
 * Eliminar cliente → papelera. Si tiene proyectos no se elimina: hay que decidir
 * "archivar todo" (archiveClient con proyectos) o cancelar (docs/02 §N7).
 */
export async function deleteClient(ctx: Ctx, id: string) {
  assertCan(ctx, "delete", "crm");
  return getDb().transaction(async (t) => {
    const c = await getClientRow(t, ctx, id);
    const projects = await clientProjectIds(t, ctx, id);
    if (projects.length) throw conflict(`«${c.name}» tiene ${projects.length} ${projects.length === 1 ? "proyecto" : "proyectos"}. Archivá todo o cancelá.`);
    const [row] = await t.update(schema.client).set({ deletedAt: now() }).where(eq(schema.client.id, id)).returning();
    await recordEvent(t, ctx, { type: "client.eliminado", entityType: "client", entityId: id, summary: `Envió a la papelera el cliente «${c.name}»` });
    return row;
  });
}

/** Archiva el cliente (estado «archivado») y, si se pide, también sus proyectos. Devuelve lo necesario para deshacer. */
export async function archiveClient(ctx: Ctx, id: string, opts: { withProjects?: boolean } = {}) {
  assertCan(ctx, "update", "crm");
  if (opts.withProjects) assertCan(ctx, "delete", "project");
  return getDb().transaction(async (t) => {
    const c = await getClientRow(t, ctx, id);
    const projectIds = opts.withProjects
      ? (
          await t
            .update(schema.project)
            .set({ archivedAt: now() })
            .where(and(eq(schema.project.clientId, id), scoped(schema.project, ctx)))
            .returning({ id: schema.project.id })
        ).map((r) => r.id)
      : [];
    await t.update(schema.client).set({ status: "archived" }).where(eq(schema.client.id, id));
    await recordEvent(t, ctx, {
      type: "cliente.estado_cambiado",
      entityType: "client",
      entityId: id,
      summary: projectIds.length ? `Archivó «${c.name}» y sus ${projectIds.length} proyectos` : `Archivó el cliente «${c.name}»`,
      payload: { from: c.status, to: "archived", projectIds },
    });
    return { previousStatus: c.status === "archived" ? "finished" : c.status, projectIds };
  });
}

/** Deshace archiveClient: vuelve al estado anterior y desarchiva esos proyectos. */
export async function unarchiveClient(ctx: Ctx, id: string, previousStatus: string, projectIds: string[] = []) {
  assertCan(ctx, "update", "crm");
  const status = z.enum(CLIENT_STATUSES).exclude(["archived"]).catch("active").parse(previousStatus);
  return getDb().transaction(async (t) => {
    const row = await changeStatus(t, ctx, id, status);
    const ids = z.array(zUuid).max(500).parse(projectIds);
    if (ids.length) {
      await t
        .update(schema.project)
        .set({ archivedAt: null })
        .where(and(inArray(schema.project.id, ids), eq(schema.project.clientId, id), eq(schema.project.workspaceId, ctx.workspaceId)));
    }
    return row;
  });
}

// ---------------------------------------------------------------------------
// Titulares fiscales (ocultos por defecto; ver requiere el recurso "fiscal")
// ---------------------------------------------------------------------------

export const fiscalInput = z.object({
  legalName: zRequired(200, "La razón social"),
  taxId: zCuit,
  vatCondition: z.preprocess((v) => (v === "" ? undefined : v), z.enum(VAT_CONDITIONS, { error: "Condición de IVA inválida" }).optional()),
  isDefault: zBool.optional(),
});

/** Devuelve los titulares del cliente y deja constancia en la auditoría (fiscal.viewed). */
export async function revealFiscalHolders(ctx: Ctx, clientId: string) {
  assertCan(ctx, "read", "fiscal");
  return getDb().transaction(async (t) => {
    await getClientRow(t, ctx, clientId);
    const rows = await t
      .select()
      .from(schema.clientFiscalHolder)
      .where(and(eq(schema.clientFiscalHolder.clientId, clientId), scoped(schema.clientFiscalHolder, ctx)))
      .orderBy(sql`${schema.clientFiscalHolder.isDefault} desc`, asc(schema.clientFiscalHolder.createdAt));
    await audit(t, ctx, { action: "fiscal.viewed", targetType: "client", targetId: clientId, after: { holders: rows.length } });
    return rows.map((r) => ({ id: r.id, legalName: r.legalName, taxId: r.taxId ? formatCuit(r.taxId) : null, vatCondition: r.vatCondition, isDefault: r.isDefault }));
  });
}

async function clearDefault(t: Tx, ctx: Ctx, clientId: string) {
  await t
    .update(schema.clientFiscalHolder)
    .set({ isDefault: false })
    .where(and(eq(schema.clientFiscalHolder.clientId, clientId), eq(schema.clientFiscalHolder.workspaceId, ctx.workspaceId)));
}

export async function addFiscalHolder(ctx: Ctx, clientId: string, raw: unknown) {
  assertCan(ctx, "create", "fiscal");
  const input = fiscalInput.parse(raw);
  return getDb().transaction(async (t) => {
    const c = await getClientRow(t, ctx, clientId);
    const [{ n } = { n: 0 }] = await t
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.clientFiscalHolder)
      .where(and(eq(schema.clientFiscalHolder.clientId, clientId), scoped(schema.clientFiscalHolder, ctx)));
    const isDefault = n === 0 || Boolean(input.isDefault);
    if (isDefault) await clearDefault(t, ctx, clientId);
    const [row] = await t
      .insert(schema.clientFiscalHolder)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, clientId, legalName: input.legalName, taxId: input.taxId?.replace(/\D/g, "") ?? null, vatCondition: input.vatCondition ?? null, isDefault })
      .returning();
    if (!row) throw new Error("No se pudo guardar el titular");
    await audit(t, ctx, { action: "fiscal.created", targetType: "client", targetId: clientId, after: { holderId: row.id } });
    await recordEvent(t, ctx, { type: "cliente.fiscal_agregado", entityType: "client", entityId: clientId, summary: `Agregó un titular fiscal a «${c.name}»` });
    return { id: row.id };
  });
}

export async function updateFiscalHolder(ctx: Ctx, holderId: string, raw: unknown) {
  assertCan(ctx, "update", "fiscal");
  const input = fiscalInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [h] = await t.select().from(schema.clientFiscalHolder).where(and(eq(schema.clientFiscalHolder.id, holderId), scoped(schema.clientFiscalHolder, ctx)));
    if (!h) throw notFound("El titular");
    if (input.isDefault) await clearDefault(t, ctx, h.clientId);
    await t
      .update(schema.clientFiscalHolder)
      .set({ legalName: input.legalName, taxId: input.taxId?.replace(/\D/g, "") ?? null, vatCondition: input.vatCondition ?? null, isDefault: input.isDefault ? true : h.isDefault })
      .where(eq(schema.clientFiscalHolder.id, holderId));
    await audit(t, ctx, { action: "fiscal.updated", targetType: "client", targetId: h.clientId, after: { holderId } });
    return { id: holderId };
  });
}

export async function removeFiscalHolder(ctx: Ctx, holderId: string) {
  assertCan(ctx, "delete", "fiscal");
  return getDb().transaction(async (t) => {
    const [h] = await t
      .update(schema.clientFiscalHolder)
      .set({ deletedAt: now() })
      .where(and(eq(schema.clientFiscalHolder.id, holderId), scoped(schema.clientFiscalHolder, ctx)))
      .returning();
    if (!h) throw notFound("El titular");
    await audit(t, ctx, { action: "fiscal.deleted", targetType: "client", targetId: h.clientId, after: { holderId } });
    return { id: holderId };
  });
}

// ---------------------------------------------------------------------------
// Contactos
// ---------------------------------------------------------------------------

export const contactInput = z.object({
  name: zRequired(160, "El nombre"),
  role: zOptText(120),
  email: zEmail,
  phone: zPhone,
  whatsapp: zPhone,
  notesMd: zOptText(20000),
});

const newContactInput = contactInput.extend({ clientId: zOptUuid, isPrimary: zBool.optional() });

async function link(t: Tx, ctx: Ctx, clientId: string, contactId: string, isPrimary: boolean, roleInClient?: string | null) {
  const [existing] = await t
    .select()
    .from(schema.clientContact)
    .where(and(eq(schema.clientContact.clientId, clientId), eq(schema.clientContact.contactId, contactId), eq(schema.clientContact.workspaceId, ctx.workspaceId)));
  const [{ n } = { n: 0 }] = await t
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.clientContact)
    .where(and(eq(schema.clientContact.clientId, clientId), eq(schema.clientContact.workspaceId, ctx.workspaceId), eq(schema.clientContact.isPrimary, true)));
  const primary = isPrimary || n === 0;
  if (primary) await t.update(schema.clientContact).set({ isPrimary: false }).where(and(eq(schema.clientContact.clientId, clientId), eq(schema.clientContact.workspaceId, ctx.workspaceId)));
  if (existing) {
    await t.update(schema.clientContact).set({ isPrimary: primary || existing.isPrimary, roleInClient: roleInClient ?? existing.roleInClient }).where(eq(schema.clientContact.id, existing.id));
  } else {
    await t.insert(schema.clientContact).values({ workspaceId: ctx.workspaceId, clientId, contactId, isPrimary: primary, roleInClient: roleInClient ?? null });
  }
}

export async function createContact(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "crm");
  const input = newContactInput.parse(raw);
  return getDb().transaction(async (t) => {
    const client = input.clientId ? await getClientRow(t, ctx, input.clientId) : null;
    const { clientId: _c, isPrimary, ...fields } = input;
    const [row] = await t.insert(schema.contact).values({ ...fields, workspaceId: ctx.workspaceId, createdBy: ctx.userId }).returning();
    if (!row) throw new Error("No se pudo crear el contacto");
    if (client) {
      await link(t, ctx, client.id, row.id, Boolean(isPrimary), input.role);
      await touchClient(t, client.id);
    }
    await recordEvent(t, ctx, {
      type: "contacto.creado",
      entityType: client ? "client" : "contact",
      entityId: client?.id ?? row.id,
      summary: client ? `Agregó a ${row.name} como contacto de «${client.name}»` : `Creó el contacto ${row.name}`,
      payload: { contactId: row.id },
    });
    return row;
  });
}

export async function updateContact(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "crm");
  const input = contactInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.contact)
      .set({ name: input.name, role: input.role ?? null, email: input.email ?? null, phone: input.phone ?? null, whatsapp: input.whatsapp ?? null, notesMd: input.notesMd ?? null })
      .where(and(eq(schema.contact.id, id), scoped(schema.contact, ctx)))
      .returning();
    if (!row) throw notFound("El contacto");
    await recordEvent(t, ctx, { type: "contacto.actualizado", entityType: "contact", entityId: id, summary: `Editó el contacto ${row.name}` });
    return row;
  });
}

export async function linkContact(ctx: Ctx, clientId: string, raw: unknown) {
  assertCan(ctx, "update", "crm");
  const input = z.object({ contactId: z.string({ error: "Elegí un contacto" }).uuid("Elegí un contacto"), isPrimary: zBool.optional(), roleInClient: zOptText(120) }).parse(raw);
  return getDb().transaction(async (t) => {
    const c = await getClientRow(t, ctx, clientId);
    const [ct] = await t.select().from(schema.contact).where(and(eq(schema.contact.id, input.contactId), scoped(schema.contact, ctx)));
    if (!ct) throw notFound("El contacto");
    await link(t, ctx, clientId, ct.id, Boolean(input.isPrimary), input.roleInClient);
    await touchClient(t, clientId);
    await recordEvent(t, ctx, { type: "contacto.vinculado", entityType: "client", entityId: clientId, summary: `Vinculó a ${ct.name} con «${c.name}»`, payload: { contactId: ct.id } });
    return { clientId, contactId: ct.id };
  });
}

export async function unlinkContact(ctx: Ctx, clientId: string, contactId: string) {
  assertCan(ctx, "update", "crm");
  return getDb().transaction(async (t) => {
    const c = await getClientRow(t, ctx, clientId);
    const [del] = await t
      .delete(schema.clientContact)
      .where(and(eq(schema.clientContact.clientId, clientId), eq(schema.clientContact.contactId, contactId), eq(schema.clientContact.workspaceId, ctx.workspaceId)))
      .returning();
    if (!del) throw notFound("El vínculo");
    await recordEvent(t, ctx, { type: "contacto.desvinculado", entityType: "client", entityId: clientId, summary: `Desvinculó un contacto de «${c.name}»`, payload: { contactId } });
    return { isPrimary: del.isPrimary, roleInClient: del.roleInClient };
  });
}

export async function setPrimaryContact(ctx: Ctx, clientId: string, contactId: string) {
  assertCan(ctx, "update", "crm");
  return getDb().transaction(async (t) => {
    await getClientRow(t, ctx, clientId);
    const [l] = await t
      .select()
      .from(schema.clientContact)
      .where(and(eq(schema.clientContact.clientId, clientId), eq(schema.clientContact.contactId, contactId), eq(schema.clientContact.workspaceId, ctx.workspaceId)));
    if (!l) throw notFound("El vínculo");
    await link(t, ctx, clientId, contactId, true);
    return { clientId, contactId };
  });
}

// ---------------------------------------------------------------------------
// Interacciones
// ---------------------------------------------------------------------------

export const interactionInput = z
  .object({
    clientId: z.string({ error: "Elegí un cliente" }).uuid("Elegí un cliente"),
    contactId: zOptUuid,
    kind: z.enum(INTERACTION_KINDS, { error: "Elegí el tipo" }),
    date: zOptDate,
    time: zOptTime,
    summaryMd: zRequired(20000, "El resumen"),
    nextStep: zOptText(300),
    nextStepDue: zOptDate,
  })
  .superRefine((v, c) => {
    if (v.nextStepDue && !v.nextStep?.trim()) c.addIssue({ code: "custom", path: ["nextStep"], message: "Escribí cuál es el próximo paso" });
  });

/** Fecha + hora de Argentina (UTC-3, sin horario de verano) → instante. */
function arInstant(date?: string, time?: string) {
  const n = now();
  if (!date) return n;
  const at = new Date(`${date}T${time ?? "12:00"}:00-03:00`);
  // Si es "este minuto" (los valores por defecto del formulario), se usa el instante exacto.
  const diff = n.getTime() - at.getTime();
  return diff >= 0 && diff < 60_000 ? n : at;
}

export async function logInteraction(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "crm");
  const input = interactionInput.parse(raw);
  return getDb().transaction(async (t) => {
    const c = await getClientRow(t, ctx, input.clientId);
    let contactName: string | null = null;
    if (input.contactId) {
      const [ct] = await t.select().from(schema.contact).where(and(eq(schema.contact.id, input.contactId), scoped(schema.contact, ctx)));
      if (!ct) throw validation("El contacto no existe", { contactId: "Elegí un contacto válido" });
      contactName = ct.name;
    }
    const [row] = await t
      .insert(schema.interaction)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        clientId: c.id,
        contactId: input.contactId ?? null,
        kind: input.kind,
        occurredAt: arInstant(input.date, input.time),
        summaryMd: input.summaryMd,
        nextStep: input.nextStep ?? null,
        nextStepDue: input.nextStep ? (input.nextStepDue ?? null) : null,
      })
      .returning();
    if (!row) throw new Error("No se pudo registrar la interacción");
    await touchClient(t, c.id);
    await recordEvent(t, ctx, {
      type: "interaccion.registrada",
      entityType: "client",
      entityId: c.id,
      summary: `Registró ${label(L.interactionKind, input.kind).toLowerCase()} con «${c.name}»${contactName ? ` (${contactName})` : ""}`,
      payload: { interactionId: row.id, kind: input.kind },
    });
    return row;
  });
}

/** Marca hecho el próximo paso de una interacción (sale de "Hoy"); queda en la actividad. */
export async function completeNextStep(ctx: Ctx, interactionId: string) {
  assertCan(ctx, "update", "crm");
  return getDb().transaction(async (t) => {
    const [before] = await t.select().from(schema.interaction).where(and(eq(schema.interaction.id, interactionId), scoped(schema.interaction, ctx)));
    if (!before) throw notFound("La interacción");
    if (!before.nextStep) throw validation("Esta interacción no tiene próximo paso");
    await t.update(schema.interaction).set({ nextStep: null, nextStepDue: null }).where(eq(schema.interaction.id, interactionId));
    await touchClient(t, before.clientId);
    await recordEvent(t, ctx, { type: "interaccion.paso_completado", entityType: "client", entityId: before.clientId, summary: `Completó el próximo paso: ${before.nextStep}`, payload: { interactionId } });
    return { id: interactionId, nextStep: before.nextStep, nextStepDue: before.nextStepDue };
  });
}

export async function restoreNextStep(ctx: Ctx, interactionId: string, nextStep: string | null, nextStepDue: string | null) {
  assertCan(ctx, "update", "crm");
  const due = zOptDate.parse(nextStepDue ?? undefined);
  const [row] = await getDb()
    .update(schema.interaction)
    .set({ nextStep: nextStep ? zRequired(300).parse(nextStep) : null, nextStepDue: due ?? null })
    .where(and(eq(schema.interaction.id, interactionId), scoped(schema.interaction, ctx)))
    .returning();
  if (!row) throw notFound("La interacción");
  return row;
}

// ---------------------------------------------------------------------------
// Oportunidades
// ---------------------------------------------------------------------------

/** "1.500.000" (miles con punto, sin coma decimal) → "1500000"; el resto lo resuelve zMoney. */
const thousandsDots = (v: unknown) => (typeof v === "string" && /^\s*\d{1,3}(\.\d{3})+\s*$/.test(v) ? v.replace(/\./g, "") : v);

export const opportunityInput = z
  .object({
    clientId: z.string({ error: "Elegí un cliente" }).uuid("Elegí un cliente"),
    title: zRequired(200, "El título"),
    valueAmount: z.preprocess(thousandsDots, zOptMoney),
    valueCurrency: zCurrency.default("ARS"),
    probability: zInt(0, 100).default(10),
    expectedClose: zOptDate,
    nextAction: zOptText(300),
    nextActionDue: zOptDate,
  })
  .superRefine((v, c) => {
    if (v.nextActionDue && !v.nextAction?.trim()) c.addIssue({ code: "custom", path: ["nextAction"], message: "Escribí cuál es la próxima acción" });
  });

async function getOppRow(t: Tx, ctx: Ctx, id: string) {
  const [o] = await t.select().from(schema.opportunity).where(and(eq(schema.opportunity.id, id), scoped(schema.opportunity, ctx)));
  if (!o) throw notFound("La oportunidad");
  return o;
}

export async function createOpportunity(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "crm");
  const input = opportunityInput.parse(raw);
  return getDb().transaction(async (t) => {
    const c = await getClientRow(t, ctx, input.clientId);
    const [{ s } = { s: 0 }] = await t
      .select({ s: sql<number>`coalesce(min(${schema.opportunity.sort}), 0)::int` })
      .from(schema.opportunity)
      .where(and(scoped(schema.opportunity, ctx), eq(schema.opportunity.stage, "new")));
    const [row] = await t
      .insert(schema.opportunity)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        clientId: c.id,
        title: input.title,
        stage: "new",
        valueAmount: input.valueAmount ?? null,
        valueCurrency: input.valueCurrency,
        probability: input.probability,
        expectedClose: input.expectedClose ?? null,
        nextAction: input.nextAction ?? null,
        nextActionDue: input.nextAction ? (input.nextActionDue ?? null) : null,
        sort: s - 1,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear la oportunidad");
    await touchClient(t, c.id);
    await recordEvent(t, ctx, { type: "oportunidad.creada", entityType: "opportunity", entityId: row.id, summary: `Abrió la oportunidad «${row.title}» con «${c.name}»`, payload: { clientId: c.id } });
    return row;
  });
}

export async function updateOpportunity(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "crm");
  const input = opportunityInput.parse(raw);
  return getDb().transaction(async (t) => {
    const before = await getOppRow(t, ctx, id);
    if (input.clientId !== before.clientId) await getClientRow(t, ctx, input.clientId);
    const [row] = await t
      .update(schema.opportunity)
      .set({
        clientId: input.clientId,
        title: input.title,
        valueAmount: input.valueAmount ?? null,
        valueCurrency: input.valueCurrency,
        probability: input.probability,
        expectedClose: input.expectedClose ?? null,
        nextAction: input.nextAction ?? null,
        nextActionDue: input.nextAction ? (input.nextActionDue ?? null) : null,
      })
      .where(eq(schema.opportunity.id, id))
      .returning();
    if (!row) throw notFound("La oportunidad");
    await touchClient(t, row.clientId);
    await recordEvent(t, ctx, { type: "oportunidad.actualizada", entityType: "opportunity", entityId: id, summary: `Editó la oportunidad «${row.title}»`, payload: { clientId: row.clientId } });
    return row;
  });
}

export const moveInput = z.object({
  stage: z.enum(STAGES, { error: "Etapa inválida" }),
  quoteId: zOptUuid,
  lostReason: z.preprocess((v) => (v === "" ? undefined : v), z.enum(LOST_REASONS, { error: "Elegí un motivo" }).optional()),
});

/**
 * Mueve una oportunidad por el pipeline con sus reglas:
 * - «propuesta enviada» exige un presupuesto vinculado (existente del cliente);
 * - «ganada» registra wonAt, y un prospecto pasa a activo;
 * - «perdida» exige motivo.
 */
export async function moveOpportunity(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "crm");
  const input = moveInput.parse(raw);
  return getDb().transaction(async (t) => {
    const o = await getOppRow(t, ctx, id);
    const c = await getClientRow(t, ctx, o.clientId);
    const stage = input.stage;

    if (input.quoteId) {
      const [q] = await t.select().from(schema.quote).where(and(eq(schema.quote.id, input.quoteId), scoped(schema.quote, ctx)));
      if (!q || q.clientId !== o.clientId) throw validation("El presupuesto no es de este cliente", { quoteId: "Elegí un presupuesto del cliente" });
      if (q.opportunityId && q.opportunityId !== o.id) throw validation("Ese presupuesto ya está vinculado a otra oportunidad", { quoteId: "Ya vinculado a otra oportunidad" });
      await t.update(schema.quote).set({ opportunityId: o.id }).where(eq(schema.quote.id, q.id));
    }
    if (stage === "proposal_sent") {
      const [linked] = await t.select({ id: schema.quote.id }).from(schema.quote).where(and(eq(schema.quote.opportunityId, o.id), scoped(schema.quote, ctx))).limit(1);
      if (!linked) throw validation("Para pasar a «Propuesta enviada» vinculá un presupuesto (o crealo).", { quoteId: "Vinculá un presupuesto" });
    }
    if (stage === "lost" && !input.lostReason) throw validation("Para marcarla perdida elegí un motivo.", { lostReason: "Elegí un motivo" });

    const patch: Partial<typeof schema.opportunity.$inferInsert> = { stage };
    if (stage === "won") Object.assign(patch, { wonAt: o.stage === "won" ? o.wonAt : now(), lostAt: null, lostReason: null, probability: 100 });
    else if (stage === "lost") Object.assign(patch, { lostAt: o.stage === "lost" ? o.lostAt : now(), lostReason: input.lostReason, wonAt: null, probability: 0 });
    else Object.assign(patch, { wonAt: null, lostAt: null, lostReason: null, ...(o.stage === "won" || o.stage === "lost" ? { probability: 50 } : {}) });
    if (o.stage !== stage) {
      const [{ s } = { s: 0 }] = await t
        .select({ s: sql<number>`coalesce(max(${schema.opportunity.sort}), 0)::int` })
        .from(schema.opportunity)
        .where(and(scoped(schema.opportunity, ctx), eq(schema.opportunity.stage, stage)));
      patch.sort = s + 1;
    }
    const [row] = await t.update(schema.opportunity).set(patch).where(eq(schema.opportunity.id, id)).returning();
    if (!row) throw notFound("La oportunidad");
    await touchClient(t, c.id);

    let clientActivated = false;
    if (o.stage !== stage) {
      const from = label(L.stage, o.stage);
      const to = label(L.stage, stage);
      if (stage === "won") {
        await recordEvent(t, ctx, { type: "oportunidad.ganada", entityType: "opportunity", entityId: id, summary: `Ganó la oportunidad «${o.title}» con «${c.name}»`, payload: { clientId: c.id, from: o.stage, value: o.valueAmount, currency: o.valueCurrency } });
        if (c.status === "prospect") {
          await changeStatus(t, ctx, c.id, "active");
          clientActivated = true;
        }
      } else if (stage === "lost") {
        await recordEvent(t, ctx, { type: "oportunidad.perdida", entityType: "opportunity", entityId: id, summary: `Perdió la oportunidad «${o.title}» (${label(L.lostReason, input.lostReason).toLowerCase()})`, payload: { clientId: c.id, from: o.stage, reason: input.lostReason } });
      } else {
        await recordEvent(t, ctx, { type: "oportunidad.etapa_cambiada", entityType: "opportunity", entityId: id, summary: `Movió «${o.title}» de ${from.toLowerCase()} a ${to.toLowerCase()}`, payload: { clientId: c.id, from: o.stage, to: stage } });
      }
    }
    return { ...row, clientActivated, clientName: c.name, previousStage: o.stage };
  });
}

/** Desvincula un presupuesto de la oportunidad. */
export async function unlinkQuote(ctx: Ctx, opportunityId: string, quoteId: string) {
  assertCan(ctx, "update", "crm");
  const [q] = await getDb()
    .update(schema.quote)
    .set({ opportunityId: null })
    .where(and(eq(schema.quote.id, quoteId), eq(schema.quote.opportunityId, opportunityId), scoped(schema.quote, ctx)))
    .returning();
  if (!q) throw notFound("El presupuesto");
  return { id: q.id };
}

// ---------------------------------------------------------------------------
// Fusionar duplicados
// ---------------------------------------------------------------------------

/**
 * Fusiona `duplicateId` dentro de `targetId`: mueve contactos, titulares, interacciones,
 * oportunidades, proyectos, presupuestos, cobros y movimientos, y manda el duplicado a la papelera.
 */
export async function mergeClients(ctx: Ctx, duplicateId: string, targetId: string) {
  assertCan(ctx, "update", "crm");
  assertCan(ctx, "delete", "crm");
  const ids = z.object({ duplicateId: zUuid, targetId: z.string({ error: "Elegí el cliente destino" }).uuid("Elegí el cliente destino") }).parse({ duplicateId, targetId });
  if (ids.duplicateId === ids.targetId) throw validation("Elegí otro cliente: no se puede fusionar consigo mismo", { targetId: "Elegí otro cliente" });
  return getDb().transaction(async (t) => {
    const dup = await getClientRow(t, ctx, ids.duplicateId);
    const target = await getClientRow(t, ctx, ids.targetId);
    const ws = ctx.workspaceId;
    const moveTo = async (table: typeof schema.interaction | typeof schema.opportunity | typeof schema.project | typeof schema.quote | typeof schema.receivable | typeof schema.transaction) => {
      const res = await t
        .update(table)
        .set({ clientId: target.id })
        .where(and(eq(table.clientId, dup.id), eq(table.workspaceId, ws)))
        .returning({ id: table.id });
      return res.length;
    };
    const counts = {
      interactions: await moveTo(schema.interaction),
      opportunities: await moveTo(schema.opportunity),
      projects: await moveTo(schema.project),
      quotes: await moveTo(schema.quote),
      receivables: await moveTo(schema.receivable),
      transactions: await moveTo(schema.transaction),
      contacts: 0,
      fiscalHolders: 0,
    };

    // Contactos: los que ya están en el destino no se duplican; el principal del destino se conserva.
    const targetLinks = await t.select().from(schema.clientContact).where(and(eq(schema.clientContact.clientId, target.id), eq(schema.clientContact.workspaceId, ws)));
    const already = new Set(targetLinks.map((l) => l.contactId));
    const hasPrimary = targetLinks.some((l) => l.isPrimary);
    const dupLinks = await t.select().from(schema.clientContact).where(and(eq(schema.clientContact.clientId, dup.id), eq(schema.clientContact.workspaceId, ws)));
    for (const l of dupLinks) {
      if (already.has(l.contactId)) {
        await t.delete(schema.clientContact).where(eq(schema.clientContact.id, l.id));
      } else {
        await t.update(schema.clientContact).set({ clientId: target.id, isPrimary: hasPrimary ? false : l.isPrimary }).where(eq(schema.clientContact.id, l.id));
        counts.contacts++;
      }
    }
    if (!hasPrimary) {
      // si el duplicado aportaba más de un principal, queda uno solo
      const prim = (await t.select().from(schema.clientContact).where(and(eq(schema.clientContact.clientId, target.id), eq(schema.clientContact.workspaceId, ws), eq(schema.clientContact.isPrimary, true)))).slice(1);
      for (const p of prim) await t.update(schema.clientContact).set({ isPrimary: false }).where(eq(schema.clientContact.id, p.id));
    }

    const [targetDefault] = await t
      .select({ id: schema.clientFiscalHolder.id })
      .from(schema.clientFiscalHolder)
      .where(and(eq(schema.clientFiscalHolder.clientId, target.id), scoped(schema.clientFiscalHolder, ctx), eq(schema.clientFiscalHolder.isDefault, true)));
    const movedFiscal = await t
      .update(schema.clientFiscalHolder)
      .set({ clientId: target.id, ...(targetDefault ? { isDefault: false } : {}) })
      .where(and(eq(schema.clientFiscalHolder.clientId, dup.id), eq(schema.clientFiscalHolder.workspaceId, ws), isNull(schema.clientFiscalHolder.deletedAt)))
      .returning({ id: schema.clientFiscalHolder.id });
    counts.fiscalHolders = movedFiscal.length;

    const mergedNotes = dup.notesMd?.trim() ? `${target.notesMd?.trim() ? `${target.notesMd.trim()}\n\n` : ""}---\n_Fusionado desde «${dup.name}» el ${todayAR()}_\n\n${dup.notesMd.trim()}` : target.notesMd;
    const lastActivity = [dup.lastActivityAt, target.lastActivityAt, now()].filter(Boolean) as Date[];
    await t
      .update(schema.client)
      .set({
        notesMd: mergedNotes,
        tradeName: target.tradeName ?? dup.tradeName,
        industry: target.industry ?? dup.industry,
        website: target.website ?? dup.website,
        city: target.city ?? dup.city,
        province: target.province ?? dup.province,
        source: target.source ?? dup.source,
        lastActivityAt: new Date(Math.max(...lastActivity.map((d) => d.getTime()))),
      })
      .where(eq(schema.client.id, target.id));
    await t.update(schema.client).set({ deletedAt: now() }).where(eq(schema.client.id, dup.id));

    await recordEvent(t, ctx, { type: "cliente.fusionado", entityType: "client", entityId: target.id, summary: `Fusionó «${dup.name}» en «${target.name}»`, payload: { duplicateId: dup.id, counts } });
    await audit(t, ctx, { action: "client.merged", targetType: "client", targetId: target.id, before: { duplicate: { id: dup.id, name: dup.name } }, after: { counts } });
    return { targetId: target.id, counts };
  });
}
