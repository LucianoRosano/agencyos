import { assertCan, type Ctx, conflict, L, label, notFound, validation, zBool, zInt, zOptText, zOptUuid, zRequired, zUrl } from "@agencyos/core";
import { recordEvent } from "@agencyos/core/events";
import { schema, type Tx } from "@agencyos/db";
import { and, asc, desc, eq, inArray, max, ne } from "drizzle-orm";
import { z } from "zod";
import { createNoteInTx } from "../notes/service";
import { assertFullAccess, assertOwned, getDb, projectScope, scoped, siteScope } from "../shared/db";
import { blueprintError, blueprintTemplate, blueprintTree, planSlotSync, SITE_KINDS } from "./blueprint";
import { generateQuestions, normalizeAnswers } from "./brief";
import { isCriticalCheck, LAUNCH_AREAS, launchSeed } from "./checklist";

export const SITE_STACKS = ["wordpress", "woocommerce", "php", "nextjs", "other"] as const;
export const PUBLICATION_STATUSES = ["building", "staging", "ready", "live", "maintenance"] as const;
export const SLOT_STATUSES = ["pending", "draft", "review", "approved", "published"] as const;
export const ASSIGNEE_TYPES = ["user", "client", "agent"] as const;
export const MOSCOW = ["must", "should", "could", "wont"] as const;
export const REQUIREMENT_STATUSES = ["pending", "in_progress", "done"] as const;
export const REVISION_ITEM_STATUSES = ["open", "in_progress", "resolved", "postponed"] as const;
export const LAUNCH_STATUSES = ["todo", "done", "na"] as const;
export const ENV_KINDS = ["prod", "staging"] as const;

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const zOptVersion = z.preprocess(
  emptyToUndef,
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+){0,3}$/, "Versión inválida (ej.: 8.2)")
    .optional(),
);

type SiteRow = typeof schema.site.$inferSelect;

async function loadSite(t: Tx, ctx: Ctx, id: string, forUpdate = false): Promise<SiteRow> {
  const q = t
    .select()
    .from(schema.site)
    .where(and(eq(schema.site.id, id), scoped(schema.site, ctx, { withArchived: true }), projectScope(ctx, schema.site.projectId)));
  const [row] = forUpdate ? await q.for("update") : await q;
  if (!row) throw notFound("El sitio");
  return row;
}

const touch = (t: Tx, siteId: string) => t.update(schema.site).set({ updatedAt: new Date() }).where(eq(schema.site.id, siteId));

// --- Sitio ---

export const siteInput = z.object({
  name: zRequired(160, "El nombre"),
  clientId: zOptUuid,
  projectId: zOptUuid,
  kind: z.enum(SITE_KINDS, { error: "Elegí el tipo de sitio" }).default("institutional"),
  stack: z.enum(SITE_STACKS, { error: "Elegí el stack" }).default("wordpress"),
  prodUrl: zUrl,
  stagingUrl: zUrl,
  notesMd: zOptText(20000),
});

const DOC_TITLE_BAD = /[[\]|#^]/g;

function docsBody(s: Pick<SiteRow, "name" | "kind" | "stack" | "prodUrl" | "stagingUrl">) {
  return `# Documentación técnica · ${s.name}

## Stack
- Tipo: ${label(L.siteKind, s.kind)}
- Stack: ${label(L.siteStack, s.stack)}
- Producción: ${s.prodUrl ?? "—"}
- Staging: ${s.stagingUrl ?? "—"}

## Plugins y versiones

## Snippets y configuraciones

## Decisiones

## Backup y restauración

## Contactos
`;
}

/** Crea la nota viva de documentación técnica del sitio (servicio de Notas) y la vincula. */
async function createDocsNote(t: Tx, ctx: Ctx, s: SiteRow) {
  const note = await createNoteInTx(t, ctx, {
    title: `Documentación técnica · ${s.name.replace(DOC_TITLE_BAD, " ").trim()}`.slice(0, 190),
    bodyMd: docsBody(s),
    folderPath: "Sitios",
    ...(s.projectId ? { entityType: "project", entityId: s.projectId } : {}),
  });
  await t
    .insert(schema.link)
    .values({
      workspaceId: ctx.workspaceId,
      fromType: "note",
      fromId: note.id,
      toType: "site",
      toId: s.id,
      kind: "docs",
      createdBy: ctx.userId ?? ctx.actor.id,
    })
    .onConflictDoNothing();
  await t.update(schema.site).set({ docsNoteId: note.id }).where(eq(schema.site.id, s.id));
  return note;
}

async function insertEnv(t: Tx, ctx: Ctx, siteId: string, kind: "prod" | "staging", url: string) {
  await t.insert(schema.siteEnvironment).values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, siteId, kind, url });
}

export async function createSite(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "create", "project");
  const input = siteInput.parse(raw);
  return getDb().transaction(async (t) => {
    await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
    let clientId = input.clientId ?? null;
    if (input.projectId) {
      const [p] = await t
        .select({ id: schema.project.id, clientId: schema.project.clientId })
        .from(schema.project)
        .where(and(eq(schema.project.id, input.projectId), scoped(schema.project, ctx, { withArchived: true })));
      if (!p) throw notFound("El proyecto");
      const [dup] = await t
        .select({ id: schema.site.id })
        .from(schema.site)
        .where(and(eq(schema.site.projectId, input.projectId), scoped(schema.site, ctx, { withArchived: true })))
        .limit(1);
      if (dup) throw validation("Ese proyecto ya tiene un sitio", { projectId: "Ese proyecto ya tiene un sitio" });
      clientId = clientId ?? p.clientId;
    }
    const [row] = await t
      .insert(schema.site)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        name: input.name,
        clientId,
        projectId: input.projectId ?? null,
        kind: input.kind,
        stack: input.stack,
        prodUrl: input.prodUrl ?? null,
        stagingUrl: input.stagingUrl ?? null,
        notesMd: input.notesMd ?? null,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear el sitio");
    await t
      .insert(schema.siteBrief)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, siteId: row.id, answers: {}, questionsForClient: [], version: 1 });
    await t.insert(schema.launchCheck).values(launchSeed(row.kind).map((c) => ({ ...c, workspaceId: ctx.workspaceId, createdBy: ctx.userId, siteId: row.id })));
    if (row.prodUrl) await insertEnv(t, ctx, row.id, "prod", row.prodUrl);
    if (row.stagingUrl) await insertEnv(t, ctx, row.id, "staging", row.stagingUrl);
    const note = await createDocsNote(t, ctx, row);
    await recordEvent(t, ctx, {
      type: "sitio.creado",
      entityType: "site",
      entityId: row.id,
      summary: `Creó el sitio «${row.name}» (${label(L.siteKind, row.kind)})`,
      payload: { kind: row.kind, projectId: row.projectId, clientId: row.clientId },
    });
    return { ...row, docsNoteId: note.id };
  });
}

export async function updateSite(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  assertFullAccess(ctx);
  const input = siteInput.parse(raw);
  return getDb().transaction(async (t) => {
    const before = await loadSite(t, ctx, id, true);
    await assertOwned(t, ctx, schema.client, input.clientId, "El cliente");
    await assertOwned(t, ctx, schema.project, input.projectId, "El proyecto");
    if (input.projectId && input.projectId !== before.projectId) {
      const [dup] = await t
        .select({ id: schema.site.id })
        .from(schema.site)
        .where(and(eq(schema.site.projectId, input.projectId), ne(schema.site.id, id), scoped(schema.site, ctx, { withArchived: true })))
        .limit(1);
      if (dup) throw validation("Ese proyecto ya tiene un sitio", { projectId: "Ese proyecto ya tiene un sitio" });
    }
    const [row] = await t
      .update(schema.site)
      .set({
        name: input.name,
        clientId: input.clientId ?? null,
        projectId: input.projectId ?? null,
        kind: input.kind,
        stack: input.stack,
        prodUrl: input.prodUrl ?? null,
        stagingUrl: input.stagingUrl ?? null,
        notesMd: input.notesMd ?? null,
      })
      .where(eq(schema.site.id, id))
      .returning();
    if (!row) throw notFound("El sitio");
    await recordEvent(t, ctx, { type: "sitio.actualizado", entityType: "site", entityId: id, summary: `Editó el sitio «${row.name}»` });
    return row;
  });
}

/** Cambia el estado de publicación. No permite «Publicado» con ítems críticos pendientes salvo `force`. */
export async function setPublicationStatus(ctx: Ctx, id: string, rawStatus: string, rawForce: unknown = false) {
  assertCan(ctx, "update", "project");
  assertFullAccess(ctx);
  const status = z.enum(PUBLICATION_STATUSES, { error: "Estado inválido" }).parse(rawStatus);
  const force = zBool.parse(rawForce);
  return getDb().transaction(async (t) => {
    const s = await loadSite(t, ctx, id, true);
    if (s.publicationStatus === status) return s;
    let pendingCritical: string[] = [];
    if (status === "live") {
      const checks = await t
        .select({ area: schema.launchCheck.area, item: schema.launchCheck.item })
        .from(schema.launchCheck)
        .where(and(eq(schema.launchCheck.siteId, id), eq(schema.launchCheck.status, "todo"), scoped(schema.launchCheck, ctx)));
      pendingCritical = checks.filter((c) => isCriticalCheck(c.area, c.item)).map((c) => c.item);
      if (pendingCritical.length && !force)
        throw validation(
          `Hay ${pendingCritical.length} ${pendingCritical.length === 1 ? "ítem crítico" : "ítems críticos"} del checklist sin hacer: ${pendingCritical.slice(0, 3).join(" · ")}${pendingCritical.length > 3 ? "…" : ""}. Confirmá para publicar igual.`,
          { status: "critical_pending" },
        );
    }
    const [row] = await t.update(schema.site).set({ publicationStatus: status }).where(eq(schema.site.id, id)).returning();
    await recordEvent(t, ctx, {
      type: "sitio.estado_publicacion_cambiado",
      entityType: "site",
      entityId: id,
      summary: `Pasó «${s.name}» a ${label(L.publicationStatus, status).toLowerCase()}${pendingCritical.length ? ` con ${pendingCritical.length} ítems críticos pendientes` : ""}`,
      payload: { from: s.publicationStatus, to: status, forcedWithPending: pendingCritical.length },
    });
    return row;
  });
}

// --- Briefing ---

async function loadBrief(t: Tx, ctx: Ctx, siteId: string) {
  const [b] = await t
    .select()
    .from(schema.siteBrief)
    .where(and(eq(schema.siteBrief.siteId, siteId), scoped(schema.siteBrief, ctx)))
    .orderBy(desc(schema.siteBrief.version))
    .limit(1)
    .for("update");
  if (b) return b;
  const [created] = await t
    .insert(schema.siteBrief)
    .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, siteId, answers: {}, questionsForClient: [], version: 0 })
    .returning();
  if (!created) throw new Error("No se pudo crear el briefing");
  return created;
}

/** Guarda las respuestas del briefing (solo claves conocidas para el tipo de sitio). */
export async function saveBrief(ctx: Ctx, siteId: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  if (!raw || typeof raw !== "object") throw validation("Respuestas inválidas");
  return getDb().transaction(async (t) => {
    const s = await loadSite(t, ctx, siteId);
    const b = await loadBrief(t, ctx, siteId);
    const answers = normalizeAnswers(s.kind, raw as Record<string, unknown>);
    const [row] = await t
      .update(schema.siteBrief)
      .set({ answers, version: b.version + 1 })
      .where(eq(schema.siteBrief.id, b.id))
      .returning();
    await touch(t, siteId);
    await recordEvent(t, ctx, { type: "sitio.briefing_guardado", entityType: "site", entityId: siteId, summary: `Actualizó el briefing de «${s.name}»` });
    return row;
  });
}

/** Regenera la lista única de preguntas a partir de lo que falta en el briefing. */
export async function generateBriefQuestions(ctx: Ctx, siteId: string) {
  assertCan(ctx, "update", "project");
  return getDb().transaction(async (t) => {
    const s = await loadSite(t, ctx, siteId);
    const b = await loadBrief(t, ctx, siteId);
    const questions = generateQuestions(s.kind, b.answers);
    const [row] = await t.update(schema.siteBrief).set({ questionsForClient: questions }).where(eq(schema.siteBrief.id, b.id)).returning();
    await recordEvent(t, ctx, {
      type: "sitio.preguntas_generadas",
      entityType: "site",
      entityId: siteId,
      summary: `Generó ${questions.length} preguntas para el cliente de «${s.name}»`,
    });
    return row;
  });
}

/** Guarda la lista de preguntas editada a mano (una por línea). */
export async function saveBriefQuestions(ctx: Ctx, siteId: string, rawText: unknown) {
  assertCan(ctx, "update", "project");
  const text = z
    .string()
    .max(20000, "Demasiado largo")
    .parse(typeof rawText === "string" ? rawText : "");
  const questions = text
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*(\d+[.)]|[-*•])\s*/, "")
        .trim()
        .slice(0, 500),
    )
    .filter(Boolean)
    .slice(0, 100);
  return getDb().transaction(async (t) => {
    await loadSite(t, ctx, siteId);
    const b = await loadBrief(t, ctx, siteId);
    const [row] = await t.update(schema.siteBrief).set({ questionsForClient: questions }).where(eq(schema.siteBrief.id, b.id)).returning();
    return row;
  });
}

// --- Requerimientos ---

export const requirementInput = z.object({
  title: zRequired(200, "El requerimiento"),
  moscow: z.enum(MOSCOW, { error: "Elegí la prioridad" }).default("must"),
  acceptanceMd: zOptText(5000),
  status: z.enum(REQUIREMENT_STATUSES).default("pending"),
});

export async function addRequirement(ctx: Ctx, siteId: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = requirementInput.parse(raw);
  return getDb().transaction(async (t) => {
    const s = await loadSite(t, ctx, siteId);
    const [{ m } = { m: null }] = await t
      .select({ m: max(schema.siteRequirement.sort) })
      .from(schema.siteRequirement)
      .where(and(eq(schema.siteRequirement.siteId, siteId), scoped(schema.siteRequirement, ctx, { withDeleted: true })));
    const [row] = await t
      .insert(schema.siteRequirement)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, siteId, ...input, acceptanceMd: input.acceptanceMd ?? null, sort: (m ?? -1) + 1 })
      .returning();
    await touch(t, siteId);
    await recordEvent(t, ctx, {
      type: "sitio.requerimiento_agregado",
      entityType: "site",
      entityId: siteId,
      summary: `Agregó el requerimiento «${input.title}» a «${s.name}»`,
    });
    return row;
  });
}

export async function updateRequirement(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = requirementInput.parse(raw);
  const [row] = await getDb()
    .update(schema.siteRequirement)
    .set({ ...input, acceptanceMd: input.acceptanceMd ?? null })
    .where(and(eq(schema.siteRequirement.id, id), scoped(schema.siteRequirement, ctx), siteScope(ctx, schema.siteRequirement.siteId)))
    .returning();
  if (!row) throw notFound("El requerimiento");
  return row;
}

export async function setRequirementStatus(ctx: Ctx, id: string, rawStatus: string) {
  assertCan(ctx, "update", "project");
  const status = z.enum(REQUIREMENT_STATUSES).parse(rawStatus);
  const [row] = await getDb()
    .update(schema.siteRequirement)
    .set({ status })
    .where(and(eq(schema.siteRequirement.id, id), scoped(schema.siteRequirement, ctx), siteScope(ctx, schema.siteRequirement.siteId)))
    .returning();
  if (!row) throw notFound("El requerimiento");
  return row;
}

/** Sube o baja un requerimiento en la lista (intercambia el orden con el vecino). */
export async function moveRequirement(ctx: Ctx, id: string, rawDir: string) {
  assertCan(ctx, "update", "project");
  const dir = z.enum(["up", "down"]).parse(rawDir);
  return getDb().transaction(async (t) => {
    const [r] = await t
      .select()
      .from(schema.siteRequirement)
      .where(and(eq(schema.siteRequirement.id, id), scoped(schema.siteRequirement, ctx), siteScope(ctx, schema.siteRequirement.siteId)));
    if (!r) throw notFound("El requerimiento");
    const list = await t
      .select({ id: schema.siteRequirement.id })
      .from(schema.siteRequirement)
      .where(and(eq(schema.siteRequirement.siteId, r.siteId), scoped(schema.siteRequirement, ctx)))
      .orderBy(asc(schema.siteRequirement.sort), asc(schema.siteRequirement.createdAt))
      .for("update");
    const i = list.findIndex((x) => x.id === id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return r;
    const ids = list.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
    for (const [k, rid] of ids.entries()) await t.update(schema.siteRequirement).set({ sort: k }).where(eq(schema.siteRequirement.id, rid));
    return r;
  });
}

// --- Estructura (blueprint) ---

function parseTree(raw: unknown) {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw validation("La estructura no es un JSON válido");
    }
  }
  const r = blueprintTree.safeParse(value);
  if (!r.success) throw validation(blueprintError(r.error), { tree: blueprintError(r.error) });
  return r.data;
}

async function writeBlueprint(t: Tx, ctx: Ctx, s: SiteRow, tree: ReturnType<typeof parseTree>, source: "manual" | "template" | "agent") {
  const [{ v } = { v: null }] = await t
    .select({ v: max(schema.siteBlueprint.version) })
    .from(schema.siteBlueprint)
    .where(and(eq(schema.siteBlueprint.siteId, s.id), eq(schema.siteBlueprint.workspaceId, ctx.workspaceId)));
  const version = (v ?? 0) + 1;
  await t
    .update(schema.siteBlueprint)
    .set({ isCurrent: false })
    .where(and(eq(schema.siteBlueprint.siteId, s.id), eq(schema.siteBlueprint.workspaceId, ctx.workspaceId), eq(schema.siteBlueprint.isCurrent, true)));
  const [bp] = await t
    .insert(schema.siteBlueprint)
    .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, siteId: s.id, version, tree, source, isCurrent: true })
    .returning();
  // Sincronizar los slots de contenido
  const existing = await t
    .select({
      id: schema.contentSlot.id,
      pageKey: schema.contentSlot.pageKey,
      sectionKey: schema.contentSlot.sectionKey,
      slotKey: schema.contentSlot.slotKey,
      kind: schema.contentSlot.kind,
      archivedAt: schema.contentSlot.archivedAt,
    })
    .from(schema.contentSlot)
    .where(and(eq(schema.contentSlot.siteId, s.id), scoped(schema.contentSlot, ctx, { withArchived: true })));
  const plan = planSlotSync(
    existing.map((e) => ({ ...e, archived: Boolean(e.archivedAt) })),
    tree,
  );
  if (plan.insert.length)
    await t.insert(schema.contentSlot).values(
      plan.insert.map((x) => ({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        siteId: s.id,
        blueprintVersion: version,
        pageKey: x.pageKey,
        sectionKey: x.sectionKey,
        slotKey: x.slotKey,
        kind: x.kind,
      })),
    );
  for (const k of plan.keep)
    await t
      .update(schema.contentSlot)
      .set({ blueprintVersion: version, kind: k.kind, ...(k.revive ? { archivedAt: null } : {}) })
      .where(eq(schema.contentSlot.id, k.id));
  if (plan.archive.length) await t.update(schema.contentSlot).set({ archivedAt: new Date() }).where(inArray(schema.contentSlot.id, plan.archive));
  await touch(t, s.id);
  await recordEvent(t, ctx, {
    type: "sitio.estructura_guardada",
    entityType: "site",
    entityId: s.id,
    summary: `Guardó la estructura v${version} de «${s.name}» (${tree.pages.length} páginas)`,
    payload: { version, source, inserted: plan.insert.length, archived: plan.archive.length },
  });
  if (!bp) throw new Error("No se pudo guardar la estructura");
  return { blueprint: bp, sync: { inserted: plan.insert.length, kept: plan.keep.length, archived: plan.archive.length } };
}

/** Guarda una nueva versión del blueprint (JSON validado) y sincroniza los slots de contenido. */
export async function saveBlueprint(ctx: Ctx, siteId: string, rawTree: unknown, rawSource: unknown = "manual") {
  assertCan(ctx, "update", "project");
  const tree = parseTree(rawTree);
  const source = z.enum(["manual", "template", "agent"]).parse(rawSource);
  return getDb().transaction(async (t) => writeBlueprint(t, ctx, await loadSite(t, ctx, siteId, true), tree, source));
}

/** Genera la estructura desde la plantilla del tipo de sitio (crea una nueva versión). */
export async function applyBlueprintTemplate(ctx: Ctx, siteId: string, rawKind?: unknown) {
  assertCan(ctx, "update", "project");
  return getDb().transaction(async (t) => {
    const s = await loadSite(t, ctx, siteId, true);
    const kind = rawKind === undefined || rawKind === "" ? s.kind : z.enum(SITE_KINDS).parse(rawKind);
    return writeBlueprint(t, ctx, s, blueprintTemplate(kind), "template");
  });
}

/** Restaura una versión anterior como versión nueva (no se reescribe la historia). */
export async function restoreBlueprintVersion(ctx: Ctx, siteId: string, rawVersion: unknown) {
  assertCan(ctx, "update", "project");
  const version = zInt(1, 100000).parse(rawVersion);
  return getDb().transaction(async (t) => {
    const s = await loadSite(t, ctx, siteId, true);
    const [old] = await t
      .select()
      .from(schema.siteBlueprint)
      .where(and(eq(schema.siteBlueprint.siteId, siteId), eq(schema.siteBlueprint.version, version), scoped(schema.siteBlueprint, ctx)));
    if (!old) throw notFound("La versión");
    return writeBlueprint(t, ctx, s, parseTree(old.tree), "manual");
  });
}

// --- Contenidos ---

export const slotInput = z.object({
  status: z.enum(SLOT_STATUSES, { error: "Estado inválido" }),
  assigneeType: z.enum(ASSIGNEE_TYPES, { error: "Responsable inválido" }).default("user"),
  bodyMd: z.string().max(50000, "Máximo 50.000 caracteres").optional(),
});

export async function updateSlot(ctx: Ctx, slotId: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = slotInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [before] = await t
      .select()
      .from(schema.contentSlot)
      .where(and(eq(schema.contentSlot.id, slotId), scoped(schema.contentSlot, ctx), siteScope(ctx, schema.contentSlot.siteId)));
    if (!before) throw notFound("El slot");
    const [row] = await t
      .update(schema.contentSlot)
      .set({ status: input.status, assigneeType: input.assigneeType, ...(input.bodyMd !== undefined ? { bodyMd: input.bodyMd.trim() || null } : {}) })
      .where(eq(schema.contentSlot.id, slotId))
      .returning();
    await touch(t, before.siteId);
    if (before.status !== input.status)
      await recordEvent(t, ctx, {
        type: "sitio.contenido_estado_cambiado",
        entityType: "site",
        entityId: before.siteId,
        summary: `Contenido «${before.pageKey} › ${before.slotKey}» → ${label(L.slotStatus, input.status).toLowerCase()}`,
        payload: { slotId, from: before.status, to: input.status },
      });
    return row;
  });
}

export async function setSlotStatus(ctx: Ctx, slotId: string, rawStatus: string) {
  assertCan(ctx, "update", "project");
  const status = z.enum(SLOT_STATUSES).parse(rawStatus);
  const [s] = await getDb()
    .select({ assigneeType: schema.contentSlot.assigneeType })
    .from(schema.contentSlot)
    .where(and(eq(schema.contentSlot.id, slotId), scoped(schema.contentSlot, ctx), siteScope(ctx, schema.contentSlot.siteId)));
  if (!s) throw notFound("El slot");
  return updateSlot(ctx, slotId, { status, assigneeType: s.assigneeType });
}

// --- Revisiones ---

export async function openRevisionRound(ctx: Ctx, siteId: string) {
  assertCan(ctx, "update", "project");
  return getDb().transaction(async (t) => {
    const s = await loadSite(t, ctx, siteId, true);
    const rounds = await t
      .select({ number: schema.revisionRound.number, status: schema.revisionRound.status })
      .from(schema.revisionRound)
      .where(and(eq(schema.revisionRound.siteId, siteId), scoped(schema.revisionRound, ctx)));
    const open = rounds.find((r) => r.status === "open");
    if (open) throw conflict(`La ronda R${open.number} sigue abierta. Cerrala antes de abrir otra.`);
    const number = Math.max(0, ...rounds.map((r) => r.number)) + 1;
    const [row] = await t
      .insert(schema.revisionRound)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, siteId, number, status: "open" })
      .returning();
    await recordEvent(t, ctx, {
      type: "revision.ronda_abierta",
      entityType: "site",
      entityId: siteId,
      summary: `Abrió la ronda de revisión R${number} de «${s.name}»`,
    });
    return row;
  });
}

export const revisionItemInput = z.object({
  pageRef: zOptText(160),
  description: zRequired(4000, "La descripción"),
  priority: zInt(1, 4).default(3),
  status: z.enum(REVISION_ITEM_STATUSES).default("open"),
  assignee: z.preprocess(emptyToUndef, z.enum(ASSIGNEE_TYPES).optional()),
});

async function loadRound(t: Tx, ctx: Ctx, roundId: string) {
  const [r] = await t
    .select()
    .from(schema.revisionRound)
    .where(and(eq(schema.revisionRound.id, roundId), scoped(schema.revisionRound, ctx), siteScope(ctx, schema.revisionRound.siteId)));
  if (!r) throw notFound("La ronda");
  return r;
}

export async function addRevisionItem(ctx: Ctx, roundId: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = revisionItemInput.parse(raw);
  return getDb().transaction(async (t) => {
    const r = await loadRound(t, ctx, roundId);
    if (r.status !== "open") throw conflict(`La ronda R${r.number} está cerrada.`);
    const [row] = await t
      .insert(schema.revisionItem)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, roundId, ...input, pageRef: input.pageRef ?? null, assignee: input.assignee ?? null })
      .returning();
    await touch(t, r.siteId);
    return row;
  });
}

export async function updateRevisionItem(ctx: Ctx, itemId: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = revisionItemInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [it] = await t
      .select()
      .from(schema.revisionItem)
      .where(and(eq(schema.revisionItem.id, itemId), scoped(schema.revisionItem, ctx)));
    if (!it) throw notFound("El ítem");
    const r = await loadRound(t, ctx, it.roundId);
    if (r.status !== "open") throw conflict(`La ronda R${r.number} está cerrada.`);
    const [row] = await t
      .update(schema.revisionItem)
      .set({ ...input, pageRef: input.pageRef ?? null, assignee: input.assignee ?? null })
      .where(eq(schema.revisionItem.id, itemId))
      .returning();
    return row;
  });
}

export async function setRevisionItemStatus(ctx: Ctx, itemId: string, rawStatus: string) {
  assertCan(ctx, "update", "project");
  const status = z.enum(REVISION_ITEM_STATUSES).parse(rawStatus);
  return getDb().transaction(async (t) => {
    const [it] = await t
      .select()
      .from(schema.revisionItem)
      .where(and(eq(schema.revisionItem.id, itemId), scoped(schema.revisionItem, ctx)));
    if (!it) throw notFound("El ítem");
    const r = await loadRound(t, ctx, it.roundId);
    if (r.status !== "open") throw conflict(`La ronda R${r.number} está cerrada.`);
    const [row] = await t.update(schema.revisionItem).set({ status }).where(eq(schema.revisionItem.id, itemId)).returning();
    return row;
  });
}

/** Cierra la ronda: exige que cada ítem esté resuelto o pospuesto. */
export async function closeRevisionRound(ctx: Ctx, roundId: string) {
  assertCan(ctx, "update", "project");
  return getDb().transaction(async (t) => {
    const [r] = await t
      .select()
      .from(schema.revisionRound)
      .where(and(eq(schema.revisionRound.id, roundId), scoped(schema.revisionRound, ctx), siteScope(ctx, schema.revisionRound.siteId)))
      .for("update");
    if (!r) throw notFound("La ronda");
    if (r.status !== "open") throw conflict(`La ronda R${r.number} ya está cerrada.`);
    const items = await t
      .select({ status: schema.revisionItem.status })
      .from(schema.revisionItem)
      .where(and(eq(schema.revisionItem.roundId, roundId), scoped(schema.revisionItem, ctx)));
    const pending = items.filter((i) => i.status === "open" || i.status === "in_progress").length;
    if (pending)
      throw validation(
        `No se puede cerrar R${r.number}: ${pending === 1 ? "queda 1 ítem abierto" : `quedan ${pending} ítems abiertos`}. Resolvé o posponé cada uno.`,
      );
    const [row] = await t.update(schema.revisionRound).set({ status: "closed", closedAt: new Date() }).where(eq(schema.revisionRound.id, roundId)).returning();
    const s = await loadSite(t, ctx, r.siteId);
    const resolved = items.filter((i) => i.status === "resolved").length;
    await recordEvent(t, ctx, {
      type: "revision.ronda_cerrada",
      entityType: "site",
      entityId: r.siteId,
      summary: `Cerró la ronda R${r.number} de «${s.name}» (${resolved} resueltos, ${items.length - resolved} pospuestos)`,
      payload: { roundId, number: r.number, items: items.length, resolved },
    });
    return row;
  });
}

// --- Entornos ---

export const environmentInput = z.object({
  kind: z.enum(ENV_KINDS, { error: "Elegí el entorno" }),
  url: zUrl.refine((v) => Boolean(v), "La URL es obligatoria"),
  hostingId: zOptUuid,
  phpVersion: zOptVersion,
  wpVersion: zOptVersion,
});

async function syncSiteUrls(t: Tx, ctx: Ctx, siteId: string) {
  const envs = await t
    .select({ kind: schema.siteEnvironment.kind, url: schema.siteEnvironment.url })
    .from(schema.siteEnvironment)
    .where(and(eq(schema.siteEnvironment.siteId, siteId), scoped(schema.siteEnvironment, ctx)))
    .orderBy(asc(schema.siteEnvironment.createdAt));
  await t
    .update(schema.site)
    .set({ prodUrl: envs.find((e) => e.kind === "prod")?.url ?? null, stagingUrl: envs.find((e) => e.kind === "staging")?.url ?? null })
    .where(eq(schema.site.id, siteId));
}

/** Alta o edición de un entorno (producción o staging). Las URLs del sitio se mantienen en sincronía. */
export async function saveEnvironment(ctx: Ctx, siteId: string, envId: string | null, raw: unknown) {
  assertCan(ctx, "update", "project");
  assertFullAccess(ctx);
  const input = environmentInput.parse(raw);
  return getDb().transaction(async (t) => {
    const s = await loadSite(t, ctx, siteId, true);
    await assertOwned(t, ctx, schema.hosting, input.hostingId, "El hosting");
    const values = {
      kind: input.kind,
      url: input.url as string,
      hostingId: input.hostingId ?? null,
      phpVersion: input.phpVersion ?? null,
      wpVersion: input.wpVersion ?? null,
    };
    let row: typeof schema.siteEnvironment.$inferSelect | undefined;
    if (envId) {
      [row] = await t
        .update(schema.siteEnvironment)
        .set(values)
        .where(and(eq(schema.siteEnvironment.id, envId), eq(schema.siteEnvironment.siteId, siteId), scoped(schema.siteEnvironment, ctx)))
        .returning();
      if (!row) throw notFound("El entorno");
    } else {
      [row] = await t
        .insert(schema.siteEnvironment)
        .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, siteId, ...values })
        .returning();
    }
    await syncSiteUrls(t, ctx, siteId);
    await recordEvent(t, ctx, {
      type: "sitio.entorno_guardado",
      entityType: "site",
      entityId: siteId,
      summary: `${envId ? "Editó" : "Agregó"} el entorno de ${label(L.envKind, input.kind).toLowerCase()} de «${s.name}»`,
    });
    return row;
  });
}

/** Tras mandar un entorno a la papelera (o restaurarlo), recalcula las URLs del sitio. */
export async function resyncSiteUrls(ctx: Ctx, envId: string) {
  assertCan(ctx, "update", "project");
  return getDb().transaction(async (t) => {
    const [e] = await t
      .select({ siteId: schema.siteEnvironment.siteId })
      .from(schema.siteEnvironment)
      .where(and(eq(schema.siteEnvironment.id, envId), eq(schema.siteEnvironment.workspaceId, ctx.workspaceId), siteScope(ctx, schema.siteEnvironment.siteId)));
    if (!e) throw notFound("El entorno");
    await syncSiteUrls(t, ctx, e.siteId);
  });
}

// --- Checklist de lanzamiento ---

export const launchCheckInput = z.object({
  status: z.enum(LAUNCH_STATUSES, { error: "Estado inválido" }),
  ownerType: z.enum(ASSIGNEE_TYPES).default("user"),
  evidenceMd: zOptText(5000),
});

export async function updateLaunchCheck(ctx: Ctx, id: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = launchCheckInput.parse(raw);
  return getDb().transaction(async (t) => {
    const [row] = await t
      .update(schema.launchCheck)
      .set({ status: input.status, ownerType: input.ownerType, evidenceMd: input.evidenceMd ?? null })
      .where(and(eq(schema.launchCheck.id, id), scoped(schema.launchCheck, ctx), siteScope(ctx, schema.launchCheck.siteId)))
      .returning();
    if (!row) throw notFound("El ítem del checklist");
    await touch(t, row.siteId);
    return row;
  });
}

export async function setLaunchCheckStatus(ctx: Ctx, id: string, rawStatus: string) {
  assertCan(ctx, "update", "project");
  const status = z.enum(LAUNCH_STATUSES).parse(rawStatus);
  const [row] = await getDb()
    .update(schema.launchCheck)
    .set({ status })
    .where(and(eq(schema.launchCheck.id, id), scoped(schema.launchCheck, ctx), siteScope(ctx, schema.launchCheck.siteId)))
    .returning();
  if (!row) throw notFound("El ítem del checklist");
  return row;
}

export async function addLaunchCheck(ctx: Ctx, siteId: string, raw: unknown) {
  assertCan(ctx, "update", "project");
  const input = z
    .object({
      area: z.enum(LAUNCH_AREAS.map((a) => a.key) as [string, ...string[]], { error: "Elegí el área" }),
      item: zRequired(300, "El ítem"),
      ownerType: z.enum(ASSIGNEE_TYPES).default("user"),
    })
    .parse(raw);
  return getDb().transaction(async (t) => {
    await loadSite(t, ctx, siteId);
    const ai = LAUNCH_AREAS.findIndex((a) => a.key === input.area);
    const [{ m } = { m: null }] = await t
      .select({ m: max(schema.launchCheck.sort) })
      .from(schema.launchCheck)
      .where(and(eq(schema.launchCheck.siteId, siteId), eq(schema.launchCheck.area, input.area), eq(schema.launchCheck.workspaceId, ctx.workspaceId)));
    const [row] = await t
      .insert(schema.launchCheck)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, siteId, ...input, status: "todo", sort: (m ?? ai * 100) + 1 })
      .returning();
    return row;
  });
}

// --- Documentación ---

/** Crea la nota de documentación si falta (o si se mandó a la papelera). */
export async function ensureDocsNote(ctx: Ctx, siteId: string) {
  assertCan(ctx, "update", "project");
  assertFullAccess(ctx);
  return getDb().transaction(async (t) => {
    const s = await loadSite(t, ctx, siteId, true);
    if (s.docsNoteId) {
      const [n] = await t
        .select({ id: schema.note.id })
        .from(schema.note)
        .where(and(eq(schema.note.id, s.docsNoteId), scoped(schema.note, ctx)));
      if (n) return { id: n.id };
    }
    const note = await createDocsNote(t, ctx, s);
    await recordEvent(t, ctx, {
      type: "sitio.documentacion_creada",
      entityType: "site",
      entityId: siteId,
      summary: `Creó la documentación técnica de «${s.name}»`,
    });
    return { id: note.id };
  });
}
