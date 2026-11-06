import { assertCan, type Ctx, L, notFound, validation, zInt, zRequired } from "@agencyos/core";
import { audit, recordEvent } from "@agencyos/core/events";
import { type DbOrTx, schema, type Tx } from "@agencyos/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, scoped } from "../shared/db";

/**
 * Etapas del pipeline editables (crm_stage).
 * - Si el workspace no tiene filas, se usan las fijas (L.stage); se siembran al primer cambio.
 * - Las 7 claves de sistema no se borran (solo se renombran/reordenan); las abiertas propias sí.
 * - `opportunity.stage` tiene un CHECK con las claves de sistema: una oportunidad en una etapa propia
 *   guarda en `stage` su etapa de sistema «base» (la abierta de sistema anterior) y la ubicación exacta
 *   en un `link` opportunity → crm_stage (kind «pipeline_stage»). Así los KPIs y reglas siguen andando.
 */

export const SYSTEM_STAGES = ["new", "contacted", "meeting", "proposal_sent", "negotiation", "won", "lost"] as const;
export type SystemStage = (typeof SYSTEM_STAGES)[number];
export const SYSTEM_OPEN = ["new", "contacted", "meeting", "proposal_sent", "negotiation"] as const;
export const DEFAULT_PROBABILITY: Record<SystemStage, number> = { new: 10, contacted: 20, meeting: 40, proposal_sent: 60, negotiation: 80, won: 100, lost: 0 };
export const STAGE_LINK_KIND = "pipeline_stage";

export type PipelineStage = {
  id: string | null;
  key: string;
  name: string;
  probability: number;
  kind: "open" | "won" | "lost";
  system: boolean;
  /** Etapa de sistema que se guarda en opportunity.stage. */
  base: SystemStage;
};

export const isSystemStage = (k: string): k is SystemStage => (SYSTEM_STAGES as readonly string[]).includes(k);

function defaults(): PipelineStage[] {
  return SYSTEM_STAGES.map((k) => ({
    id: null,
    key: k,
    name: L.stage[k],
    probability: DEFAULT_PROBABILITY[k],
    kind: k === "won" ? "won" : k === "lost" ? "lost" : "open",
    system: true,
    base: k,
  }));
}

type Row = typeof schema.crmStage.$inferSelect;

/** Ordena (abiertas por `sort`, después ganada y perdida) y calcula la etapa base de cada abierta propia. */
function normalize(rows: Row[]): PipelineStage[] {
  const open = rows.filter((r) => r.kind === "open").sort((a, b) => a.sort - b.sort || a.createdAt.getTime() - b.createdAt.getTime());
  const closed = (["won", "lost"] as const).map((k) => rows.find((r) => r.key === k));
  const out: PipelineStage[] = [];
  let lastSystem: SystemStage | null = null;
  const pending: PipelineStage[] = [];
  for (const r of open) {
    const system = isSystemStage(r.key);
    const st: PipelineStage = {
      id: r.id,
      key: r.key,
      name: r.name,
      probability: r.probability,
      kind: "open",
      system,
      base: system ? (r.key as SystemStage) : (lastSystem ?? "new"),
    };
    if (system) {
      lastSystem = r.key as SystemStage;
      // las propias que estaban antes de cualquier etapa de sistema toman la primera de sistema
      for (const p of pending) p.base = lastSystem;
      pending.length = 0;
    } else if (!lastSystem) pending.push(st);
    out.push(st);
  }
  for (const [i, k] of (["won", "lost"] as const).entries()) {
    const r = closed[i];
    out.push({ id: r?.id ?? null, key: k, name: r?.name ?? L.stage[k], probability: DEFAULT_PROBABILITY[k], kind: k, system: true, base: k });
  }
  return out;
}

async function stageRows(db: DbOrTx, ctx: Ctx) {
  return (db as Tx).select().from(schema.crmStage).where(scoped(schema.crmStage, ctx)).orderBy(asc(schema.crmStage.sort));
}

/** Etapas del pipeline del workspace (con fallback a las fijas). Lectura pura: no siembra. */
export async function listPipelineStages(ctx: Ctx, db: DbOrTx = getDb()): Promise<PipelineStage[]> {
  const rows = await stageRows(db, ctx);
  return rows.length ? normalize(rows) : defaults();
}

/** Siembra las etapas actuales la primera vez que se editan (idempotente, con lock por workspace). */
export async function ensureStages(t: Tx, ctx: Ctx) {
  await t.execute(sql`select pg_advisory_xact_lock(hashtext(${`crm_stage:${ctx.workspaceId}`}))`);
  const rows = await stageRows(t, ctx);
  if (rows.length) return rows;
  return t
    .insert(schema.crmStage)
    .values(
      defaults().map((s, i) => ({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        key: s.key,
        name: s.name,
        probability: s.probability,
        sort: s.kind === "open" ? i * 10 : 1000 + i,
        kind: s.kind,
      })),
    )
    .returning();
}

/** Ubicación exacta de oportunidades en etapas propias: oppId → clave de etapa. */
export async function stagePlacements(ctx: Ctx, oppIds?: string[], db: DbOrTx = getDb()): Promise<Map<string, string>> {
  if (oppIds && !oppIds.length) return new Map();
  const rows = await (db as Tx)
    .select({ oppId: schema.link.fromId, key: schema.crmStage.key })
    .from(schema.link)
    .innerJoin(schema.crmStage, eq(schema.crmStage.id, schema.link.toId))
    .where(
      and(
        eq(schema.link.workspaceId, ctx.workspaceId),
        eq(schema.link.fromType, "opportunity"),
        eq(schema.link.toType, "crm_stage"),
        eq(schema.link.kind, STAGE_LINK_KIND),
        scoped(schema.crmStage, ctx),
        oppIds ? inArray(schema.link.fromId, oppIds) : undefined,
      ),
    );
  return new Map(rows.map((r) => [r.oppId, r.key]));
}

/** Clave de etapa visible: la propia si la tiene y su base coincide con la guardada; si no, la de sistema. */
export function effectiveStage(opp: { id: string; stage: string }, placements: Map<string, string>, stages: PipelineStage[]): string {
  const k = placements.get(opp.id);
  if (!k) return opp.stage;
  const st = stages.find((s) => s.key === k);
  return st && st.base === opp.stage ? k : opp.stage;
}

/** Fija (o quita) la etapa propia de una oportunidad. */
export async function setPlacement(t: Tx, ctx: Ctx, oppId: string, stageId: string | null) {
  await t
    .delete(schema.link)
    .where(
      and(
        eq(schema.link.workspaceId, ctx.workspaceId),
        eq(schema.link.fromType, "opportunity"),
        eq(schema.link.fromId, oppId),
        eq(schema.link.toType, "crm_stage"),
        eq(schema.link.kind, STAGE_LINK_KIND),
      ),
    );
  if (stageId)
    await t.insert(schema.link).values({
      workspaceId: ctx.workspaceId,
      fromType: "opportunity",
      fromId: oppId,
      toType: "crm_stage",
      toId: stageId,
      kind: STAGE_LINK_KIND,
      createdBy: ctx.userId,
    });
}

// ---------------------------------------------------------------------------
// Edición (Configuración → CRM)
// ---------------------------------------------------------------------------

export const stageInput = z.object({
  name: zRequired(40, "El nombre"),
  probability: zInt(0, 100),
});

async function getStage(t: Tx, ctx: Ctx, key: string) {
  const rows = await ensureStages(t, ctx);
  const row = rows.find((r) => r.key === key);
  if (!row) throw notFound("La etapa");
  return { row, rows };
}

export async function updateStage(ctx: Ctx, key: string, raw: unknown) {
  assertCan(ctx, "manage", "settings");
  const input = stageInput.parse(raw);
  return getDb().transaction(async (t) => {
    const { row } = await getStage(t, ctx, key);
    const probability = row.kind === "won" ? 100 : row.kind === "lost" ? 0 : input.probability;
    const [up] = await t.update(schema.crmStage).set({ name: input.name, probability }).where(eq(schema.crmStage.id, row.id)).returning();
    await audit(t, ctx, {
      action: "crm.stage_updated",
      targetType: "crm_stage",
      targetId: row.id,
      before: { name: row.name, probability: row.probability },
      after: { name: input.name, probability },
    });
    return up;
  });
}

export async function addStage(ctx: Ctx, raw: unknown) {
  assertCan(ctx, "manage", "settings");
  const input = stageInput.extend({ afterKey: z.string().max(40).optional() }).parse(raw);
  return getDb().transaction(async (t) => {
    const rows = await ensureStages(t, ctx);
    const open = normalize(rows).filter((s) => s.kind === "open");
    if (open.length >= 12) throw validation("Máximo 12 etapas abiertas");
    if (open.some((s) => s.name.trim().toLowerCase() === input.name.trim().toLowerCase()))
      throw validation("Ya hay una etapa con ese nombre", { name: "Elegí otro nombre" });
    const key = `c_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const idx = input.afterKey ? open.findIndex((s) => s.key === input.afterKey) : open.length - 1;
    const order = [...open.map((s) => s.key)];
    order.splice((idx < 0 ? open.length - 1 : idx) + 1, 0, key);
    const [row] = await t
      .insert(schema.crmStage)
      .values({ workspaceId: ctx.workspaceId, createdBy: ctx.userId, key, name: input.name, probability: input.probability, sort: 0, kind: "open" })
      .returning();
    await resort(t, ctx, order);
    await recordEvent(t, ctx, {
      type: "crm.etapa_creada",
      entityType: "workspace",
      entityId: ctx.workspaceId,
      summary: `Agregó la etapa «${input.name}» al pipeline`,
    });
    return row;
  });
}

async function resort(t: Tx, ctx: Ctx, keys: string[]) {
  for (const [i, k] of keys.entries())
    await t
      .update(schema.crmStage)
      .set({ sort: i * 10 })
      .where(and(scoped(schema.crmStage, ctx), eq(schema.crmStage.key, k)));
}

export async function moveStage(ctx: Ctx, key: string, dir: "up" | "down") {
  assertCan(ctx, "manage", "settings");
  return getDb().transaction(async (t) => {
    const rows = await ensureStages(t, ctx);
    const keys = normalize(rows)
      .filter((s) => s.kind === "open")
      .map((s) => s.key);
    const i = keys.indexOf(key);
    if (i < 0) throw validation("Solo se reordenan las etapas abiertas");
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= keys.length) return { key, moved: false };
    [keys[i], keys[j]] = [keys[j] as string, keys[i] as string];
    await resort(t, ctx, keys);
    return { key, moved: true };
  });
}

/** Elimina (papelera lógica) una etapa propia: sus oportunidades vuelven a verse en su etapa base. */
export async function deleteStage(ctx: Ctx, key: string) {
  assertCan(ctx, "manage", "settings");
  if (isSystemStage(key)) throw validation("Las etapas del sistema no se eliminan; podés renombrarlas.");
  return getDb().transaction(async (t) => {
    const { row } = await getStage(t, ctx, key);
    await t.update(schema.crmStage).set({ deletedAt: new Date() }).where(eq(schema.crmStage.id, row.id));
    await recordEvent(t, ctx, {
      type: "crm.etapa_eliminada",
      entityType: "workspace",
      entityId: ctx.workspaceId,
      summary: `Eliminó la etapa «${row.name}» del pipeline`,
    });
    return { key, name: row.name };
  });
}

export async function restoreStage(ctx: Ctx, key: string) {
  assertCan(ctx, "manage", "settings");
  const [row] = await getDb()
    .update(schema.crmStage)
    .set({ deletedAt: null })
    .where(and(eq(schema.crmStage.workspaceId, ctx.workspaceId), eq(schema.crmStage.key, key)))
    .returning();
  if (!row) throw notFound("La etapa");
  return row;
}

/** Busca una etapa por clave para mover oportunidades. */
export async function stageByKey(t: Tx, ctx: Ctx, key: string) {
  const stages = await listPipelineStages(ctx, t);
  return { stage: stages.find((s) => s.key === key) ?? null, stages };
}

/** Para las vistas: etapas + etapa visible de cada oportunidad (oppId → clave). */
export async function pipelineFor(ctx: Ctx, opps: { id: string; stage: string }[]) {
  const [stages, placements] = await Promise.all([
    listPipelineStages(ctx),
    stagePlacements(
      ctx,
      opps.map((o) => o.id),
    ),
  ]);
  const stageOf = new Map(opps.map((o) => [o.id, effectiveStage(o, placements, stages)]));
  return { stages, stageOf };
}
