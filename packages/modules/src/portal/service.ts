import { assertCan, type Ctx, conflict, forbidden, notFound, systemCtx, validation, zInt, zOptText, zRequired } from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { getDb, schema } from "@agencyos/db";
import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { decideQuoteForClient, openQuoteForClient } from "../quotes/public";
import { getQuoteDocument } from "../quotes/queries";
import { signPath, verifySignedPath } from "../shared/crypto";
import { assertFullAccess, scoped } from "../shared/db";
import { addRevisionItem } from "../sites/service";

/**
 * Portal de clientes (M15). Un usuario `client` ve SOLO lo de su cliente del CRM (guardado en user_preference,
 * ver users/service portalPrefKey): sus proyectos (estado, etapas, entregas), las rondas de revisión del sitio,
 * los recursos que el dueño marcó como compartidos y sus presupuestos enviados. Nunca comentarios internos,
 * finanzas internas ni datos de otros clientes.
 */

/** Etiqueta reservada: un archivo de la Biblioteca con esta etiqueta se ve en el portal del cliente vinculado. */
export const SHARED_TAG = "compartido";
const VISIBLE_QUOTE_STATUSES = ["sent", "viewed", "accepted", "rejected", "expired"];

export type PortalCtx = Pick<Ctx, "workspaceId" | "userId" | "role" | "actor" | "ip" | "userAgent"> & { clientId: string | null };

function requireClient(pc: PortalCtx): string {
  if (pc.role !== "client" || !pc.userId) throw forbidden();
  if (!pc.clientId) throw forbidden("Tu acceso todavía no tiene un cliente asignado. Escribile a Luciano.");
  return pc.clientId;
}

/** Contexto con el que se escriben los cambios del cliente: actor identificado, rol cliente. */
function actorCtx(pc: PortalCtx): Ctx {
  return {
    workspaceId: pc.workspaceId,
    userId: pc.userId,
    role: "client",
    actor: { ...pc.actor, name: `${pc.actor.name} (cliente)` },
    ip: pc.ip,
    userAgent: pc.userAgent,
  };
}

async function ownProject(pc: PortalCtx, projectId: string) {
  const clientId = requireClient(pc);
  if (!z.string().uuid().safeParse(projectId).success) return null;
  const [p] = await getDb()
    .select()
    .from(schema.project)
    .where(
      and(eq(schema.project.id, projectId), eq(schema.project.clientId, clientId), scoped(schema.project, pc), notInArray(schema.project.status, ["archived"])),
    );
  return p ?? null;
}

// --- Proyectos ---

export async function portalHome(pc: PortalCtx) {
  const clientId = requireClient(pc);
  const db = getDb();
  const [client] = await db
    .select({ name: schema.client.name })
    .from(schema.client)
    .where(and(eq(schema.client.id, clientId), scoped(schema.client, pc)));
  const projects = await db
    .select({
      id: schema.project.id,
      name: schema.project.name,
      status: schema.project.status,
      progress: schema.project.progress,
      targetDate: schema.project.targetDate,
    })
    .from(schema.project)
    .where(and(scoped(schema.project, pc), eq(schema.project.clientId, clientId), notInArray(schema.project.status, ["archived"])))
    .orderBy(asc(schema.project.priority), desc(schema.project.lastActivityAt));
  const ids = projects.map((p) => p.id);
  const [phases, deliverables] = ids.length
    ? await Promise.all([
        db
          .select({
            projectId: schema.projectPhase.projectId,
            name: schema.projectPhase.name,
            status: schema.projectPhase.status,
            sort: schema.projectPhase.sort,
          })
          .from(schema.projectPhase)
          .where(and(scoped(schema.projectPhase, pc), inArray(schema.projectPhase.projectId, ids)))
          .orderBy(asc(schema.projectPhase.sort)),
        db
          .select({
            id: schema.deliverable.id,
            projectId: schema.deliverable.projectId,
            title: schema.deliverable.title,
            status: schema.deliverable.status,
            dueDate: schema.deliverable.dueDate,
          })
          .from(schema.deliverable)
          .where(
            and(
              scoped(schema.deliverable, pc),
              inArray(schema.deliverable.projectId, ids),
              inArray(schema.deliverable.status, ["pending", "delivered", "changes_requested"]),
            ),
          )
          .orderBy(sql`${schema.deliverable.dueDate} asc nulls last`),
      ])
    : [[], []];
  return {
    clientName: client?.name ?? null,
    projects: projects.map((p) => ({ ...p, currentPhase: currentPhase(phases.filter((ph) => ph.projectId === p.id)) })),
    deliverables: deliverables.map((d) => ({ ...d, projectName: projects.find((p) => p.id === d.projectId)?.name ?? "" })),
  };
}

function currentPhase(phases: { name: string; status: string }[]) {
  return (phases.find((p) => p.status === "in_progress") ?? phases.find((p) => p.status === "pending"))?.name ?? null;
}

export async function portalProject(pc: PortalCtx, projectId: string) {
  const p = await ownProject(pc, projectId);
  if (!p) return null;
  const db = getDb();
  const [phases, deliverables, [site]] = await Promise.all([
    db
      .select({ id: schema.projectPhase.id, name: schema.projectPhase.name, status: schema.projectPhase.status, dueDate: schema.projectPhase.dueDate })
      .from(schema.projectPhase)
      .where(and(scoped(schema.projectPhase, pc), eq(schema.projectPhase.projectId, p.id)))
      .orderBy(asc(schema.projectPhase.sort)),
    db
      .select({
        id: schema.deliverable.id,
        title: schema.deliverable.title,
        contentMd: schema.deliverable.contentMd,
        status: schema.deliverable.status,
        dueDate: schema.deliverable.dueDate,
        approvedAt: schema.deliverable.approvedAt,
      })
      .from(schema.deliverable)
      .where(and(scoped(schema.deliverable, pc), eq(schema.deliverable.projectId, p.id)))
      .orderBy(sql`${schema.deliverable.dueDate} asc nulls last`),
    db
      .select({ id: schema.site.id, name: schema.site.name, prodUrl: schema.site.prodUrl, stagingUrl: schema.site.stagingUrl })
      .from(schema.site)
      .where(and(scoped(schema.site, pc), eq(schema.site.projectId, p.id)))
      .limit(1),
  ]);
  let rounds: {
    id: string;
    number: number;
    status: string;
    items: { id: string; pageRef: string | null; description: string; priority: number; status: string }[];
  }[] = [];
  if (site) {
    const rs = await db
      .select({ id: schema.revisionRound.id, number: schema.revisionRound.number, status: schema.revisionRound.status })
      .from(schema.revisionRound)
      .where(and(scoped(schema.revisionRound, pc), eq(schema.revisionRound.siteId, site.id)))
      .orderBy(desc(schema.revisionRound.number))
      .limit(10);
    const items = rs.length
      ? await db
          .select({
            id: schema.revisionItem.id,
            roundId: schema.revisionItem.roundId,
            pageRef: schema.revisionItem.pageRef,
            description: schema.revisionItem.description,
            priority: schema.revisionItem.priority,
            status: schema.revisionItem.status,
          })
          .from(schema.revisionItem)
          .where(
            and(
              scoped(schema.revisionItem, pc),
              inArray(
                schema.revisionItem.roundId,
                rs.map((r) => r.id),
              ),
            ),
          )
          .orderBy(asc(schema.revisionItem.priority), asc(schema.revisionItem.createdAt))
      : [];
    rounds = rs.map((r) => ({ ...r, items: items.filter((i) => i.roundId === r.id).map(({ roundId: _r, ...i }) => i) }));
  }
  const files = await sharedFiles(pc, { projectId: p.id });
  return {
    project: { id: p.id, name: p.name, status: p.status, progress: p.progress, goal: p.goal, startDate: p.startDate, targetDate: p.targetDate },
    phases,
    deliverables,
    site: site ? { ...site, openRound: rounds.find((r) => r.status === "open") ?? null, rounds } : null,
    files,
  };
}

// --- Entregas ---

const deliverableDecision = z.object({
  decision: z.enum(["approve", "changes"]),
  comment: zOptText(2000),
});

/** Aprobar o pedir cambios sobre una entrega entregada. Notifica al dueño (NOTIFY del worker). */
export async function decideDeliverable(pc: PortalCtx, deliverableId: string, raw: unknown) {
  const clientId = requireClient(pc);
  const input = deliverableDecision.parse(raw);
  if (input.decision === "changes" && !input.comment) throw validation("Contanos qué cambios necesitás", { comment: "Obligatorio" });
  const ctx = actorCtx(pc);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .select({ d: schema.deliverable, projectName: schema.project.name })
      .from(schema.deliverable)
      .innerJoin(schema.project, and(eq(schema.project.id, schema.deliverable.projectId), eq(schema.project.workspaceId, schema.deliverable.workspaceId)))
      .where(
        and(eq(schema.deliverable.id, deliverableId), scoped(schema.deliverable, pc), eq(schema.project.clientId, clientId), isNull(schema.project.deletedAt)),
      )
      .for("update");
    if (!row) throw notFound("La entrega");
    if (row.d.status !== "delivered") throw conflict("Esta entrega no está esperando tu aprobación.");
    const approved = input.decision === "approve";
    const [updated] = await t
      .update(schema.deliverable)
      .set({ status: approved ? "approved" : "changes_requested", approvedAt: approved ? new Date() : null })
      .where(eq(schema.deliverable.id, deliverableId))
      .returning();
    await t.insert(schema.changelogEntry).values({
      workspaceId: pc.workspaceId,
      createdBy: pc.userId,
      projectId: row.d.projectId,
      kind: approved ? "release" : "auto",
      title: approved ? `El cliente aprobó la entrega «${row.d.title}»` : `El cliente pidió cambios en «${row.d.title}»`,
      bodyMd: input.comment ?? null,
    });
    await recordEvent(t, ctx, {
      type: approved ? "entrega.aprobada_por_cliente" : "entrega.cambios_pedidos",
      entityType: "project",
      entityId: row.d.projectId,
      summary: approved
        ? `${pc.actor.name} aprobó la entrega «${row.d.title}» de «${row.projectName}»`
        : `${pc.actor.name} pidió cambios en «${row.d.title}»: ${(input.comment ?? "").slice(0, 120)}`,
      payload: { deliverableId, comment: input.comment ?? null },
    });
    await audit(t, ctx, { action: approved ? "portal.entrega_aprobada" : "portal.entrega_cambios", targetType: "deliverable", targetId: deliverableId });
    return updated;
  });
}

// --- Revisiones del sitio ---

export const feedbackInput = z.object({
  pageRef: zOptText(160),
  description: zRequired(4000, "La descripción"),
  priority: zInt(1, 4).default(3),
});

/** Carga un ítem de feedback en la ronda abierta del sitio del proyecto (vía el service de sitios). */
export async function addSiteFeedback(pc: PortalCtx, projectId: string, raw: unknown) {
  const p = await ownProject(pc, projectId);
  if (!p) throw notFound("El proyecto");
  const input = feedbackInput.parse(raw);
  const db = getDb();
  const [round] = await db
    .select({ id: schema.revisionRound.id, number: schema.revisionRound.number, siteId: schema.site.id, siteName: schema.site.name })
    .from(schema.revisionRound)
    .innerJoin(schema.site, and(eq(schema.site.id, schema.revisionRound.siteId), eq(schema.site.workspaceId, schema.revisionRound.workspaceId)))
    .where(and(scoped(schema.revisionRound, pc), eq(schema.revisionRound.status, "open"), eq(schema.site.projectId, p.id), isNull(schema.site.deletedAt)))
    .limit(1);
  if (!round) throw conflict("No hay una ronda de revisión abierta. Luciano te avisa cuando abra la próxima.");
  // El service de sitios exige permisos internos: se usa el contexto de sistema con el cliente como actor visible.
  const sys: Ctx = { ...systemCtx(pc.workspaceId), actor: { type: "system", id: pc.userId, name: `${pc.actor.name} (cliente)` } };
  const item = await addRevisionItem(sys, round.id, { ...input, status: "open", assignee: "user" });
  await db.transaction(async (t) => {
    await recordEvent(t, actorCtx(pc), {
      type: "revision.feedback_cliente",
      entityType: "site",
      entityId: round.siteId,
      summary: `${pc.actor.name} cargó feedback en la ronda R${round.number} de «${round.siteName}»: ${input.description.slice(0, 100)}`,
      payload: { roundId: round.id, itemId: item?.id ?? null, priority: input.priority },
    });
  });
  return item;
}

// --- Recursos compartidos ---

async function sharedTagId(workspaceId: string) {
  const [t] = await getDb()
    .select({ id: schema.tag.id })
    .from(schema.tag)
    .where(and(eq(schema.tag.workspaceId, workspaceId), isNull(schema.tag.deletedAt), sql`lower(${schema.tag.name}) = ${SHARED_TAG}`));
  return t?.id ?? null;
}

/** Archivos con la etiqueta «compartido» vinculados a un proyecto del cliente o al cliente (sin proyecto). */
export async function sharedFiles(pc: PortalCtx, opts: { projectId?: string } = {}) {
  const clientId = requireClient(pc);
  const tagId = await sharedTagId(pc.workspaceId);
  if (!tagId) return [];
  const own = getDb()
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(and(eq(schema.project.workspaceId, pc.workspaceId), eq(schema.project.clientId, clientId), isNull(schema.project.deletedAt)));
  const rows = await getDb()
    .select({
      id: schema.file.id,
      name: schema.file.name,
      mime: schema.file.mime,
      size: schema.file.size,
      kind: schema.file.kind,
      projectId: schema.file.projectId,
    })
    .from(schema.file)
    .innerJoin(
      schema.tagging,
      and(
        eq(schema.tagging.entityId, schema.file.id),
        eq(schema.tagging.entityType, "file"),
        eq(schema.tagging.tagId, tagId),
        eq(schema.tagging.workspaceId, pc.workspaceId),
      ),
    )
    .where(
      and(
        scoped(schema.file, pc),
        opts.projectId
          ? or(eq(schema.file.projectId, opts.projectId), and(isNull(schema.file.projectId), eq(schema.file.clientId, clientId)))
          : or(inArray(schema.file.projectId, own), and(isNull(schema.file.projectId), eq(schema.file.clientId, clientId))),
      ),
    )
    .orderBy(desc(schema.file.createdAt))
    .limit(200);
  return rows.map((f) => ({ ...f, url: signPath(`/portal/archivos/${f.id}`) }));
}

/** Para la descarga: el archivo tiene que estar compartido y ser de este cliente. */
export async function resolveSharedFile(pc: PortalCtx, fileId: string, params: URLSearchParams) {
  if (!verifySignedPath(`/portal/archivos/${fileId}`, params.get("exp"), params.get("sig"))) return { ok: false as const, reason: "expired" as const };
  if (!z.string().uuid().safeParse(fileId).success) return { ok: false as const, reason: "missing" as const };
  const list = await sharedFiles(pc);
  if (!list.some((f) => f.id === fileId)) return { ok: false as const, reason: "missing" as const };
  const [f] = await getDb()
    .select()
    .from(schema.file)
    .where(and(eq(schema.file.id, fileId), scoped(schema.file, pc)));
  return f ? { ok: true as const, file: f } : { ok: false as const, reason: "missing" as const };
}

/** Interruptor «Compartir con el cliente» de la ficha interna del archivo (etiqueta reservada «compartido»). */
export async function setFileShared(ctx: Ctx, fileId: string, shared: boolean) {
  assertCan(ctx, "update", "project");
  assertFullAccess(ctx);
  return getDb().transaction(async (t) => {
    const [f] = await t
      .select()
      .from(schema.file)
      .where(and(eq(schema.file.id, fileId), scoped(schema.file, ctx)));
    if (!f) throw notFound("El archivo");
    if (shared && !f.clientId && !f.projectId) throw validation("Vinculá el archivo a un cliente o a un proyecto para poder compartirlo.");
    let tagId = await sharedTagId(ctx.workspaceId);
    if (!tagId && shared) {
      const [tg] = await t
        .insert(schema.tag)
        .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, name: SHARED_TAG, color: "#34D399" })
        .onConflictDoNothing()
        .returning();
      tagId = tg?.id ?? (await sharedTagId(ctx.workspaceId));
    }
    if (!tagId) return { shared: false };
    if (shared) await t.insert(schema.tagging).values({ workspaceId: ctx.workspaceId, tagId, entityType: "file", entityId: fileId }).onConflictDoNothing();
    else await t.delete(schema.tagging).where(and(eq(schema.tagging.tagId, tagId), eq(schema.tagging.entityType, "file"), eq(schema.tagging.entityId, fileId)));
    await recordEvent(t, ctx, {
      type: shared ? "archivo.compartido" : "archivo.no_compartido",
      entityType: "file",
      entityId: fileId,
      summary: shared ? `Compartió «${f.name}» con el cliente` : `Dejó de compartir «${f.name}» con el cliente`,
    });
    return { shared };
  });
}

export async function isFileShared(ctx: Ctx, fileId: string) {
  const tagId = await sharedTagId(ctx.workspaceId);
  if (!tagId) return false;
  const [r] = await getDb()
    .select({ id: schema.tagging.id })
    .from(schema.tagging)
    .where(
      and(
        eq(schema.tagging.workspaceId, ctx.workspaceId),
        eq(schema.tagging.tagId, tagId),
        eq(schema.tagging.entityType, "file"),
        eq(schema.tagging.entityId, fileId),
      ),
    );
  return Boolean(r);
}

// --- Presupuestos ---

export async function portalQuotes(pc: PortalCtx) {
  const clientId = requireClient(pc);
  return getDb()
    .select({
      id: schema.quote.id,
      number: schema.quote.number,
      title: schema.quote.title,
      status: schema.quote.status,
      sentAt: schema.quote.sentAt,
      validUntil: schema.quoteVersion.validUntil,
      total: schema.quoteVersion.total,
      currency: schema.quoteVersion.currency,
    })
    .from(schema.quote)
    .leftJoin(
      schema.quoteVersion,
      and(eq(schema.quoteVersion.id, schema.quote.currentVersionId), eq(schema.quoteVersion.workspaceId, schema.quote.workspaceId)),
    )
    .where(and(scoped(schema.quote, pc), eq(schema.quote.clientId, clientId), inArray(schema.quote.status, VISIBLE_QUOTE_STATUSES)))
    .orderBy(desc(schema.quote.sentAt), desc(schema.quote.createdAt));
}

async function ownQuote(pc: PortalCtx, quoteId: string) {
  const clientId = requireClient(pc);
  if (!z.string().uuid().safeParse(quoteId).success) return null;
  const [q] = await getDb()
    .select()
    .from(schema.quote)
    .where(
      and(eq(schema.quote.id, quoteId), eq(schema.quote.clientId, clientId), scoped(schema.quote, pc), inArray(schema.quote.status, VISIBLE_QUOTE_STATUSES)),
    );
  return q ?? null;
}

/** Ver un presupuesto (lo marca "visto" la primera vez, como el enlace público). */
export async function portalQuote(pc: PortalCtx, quoteId: string) {
  const q = await ownQuote(pc, quoteId);
  if (!q) return null;
  return openQuoteForClient(q, `portal · ${pc.actor.name}`);
}

export async function portalQuoteDocument(pc: PortalCtx, quoteId: string) {
  const q = await ownQuote(pc, quoteId);
  if (!q) return null;
  return getQuoteDocument(systemCtx(pc.workspaceId), q.id);
}

/** Aceptar / rechazar con nombre del firmante: misma lógica que el enlace público (quotes/public). */
export async function decidePortalQuote(pc: PortalCtx, quoteId: string, raw: unknown) {
  const q = await ownQuote(pc, quoteId);
  if (!q) throw notFound("El presupuesto");
  return decideQuoteForClient(q, raw, { ip: pc.ip, userAgent: pc.userAgent, via: "portal" });
}
