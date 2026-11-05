import { assertCan, type Ctx, L } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";
import { ACTION_TYPES, COMMON_FIELDS, ENTITY_FIELDS, ENTITY_KEYS, EVENT_CATALOG, RUN_STATUS, SCHEDULE_SOURCES } from "./catalog";
import { CONDITION_OPS, nextRuns, SCHEDULE_PRESETS, WEEKDAYS } from "./engine";
import { ruleSource } from "./runner";
import { describeTrigger } from "./service";
import { TEMPLATES } from "./templates";

export async function listRules(ctx: Ctx) {
  assertCan(ctx, "read", "settings");
  const db = getDb();
  const rules = await db
    .select()
    .from(schema.automationRule)
    .where(scoped(schema.automationRule, ctx))
    .orderBy(desc(schema.automationRule.active), desc(schema.automationRule.createdAt));
  if (!rules.length) return [];
  const ids = rules.map((r) => r.id);
  const stats = await db
    .select({
      ruleId: schema.automationRun.ruleId,
      total: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${schema.automationRun.status} = 'failed')::int`,
      lastStatus: sql<string | null>`(array_agg(${schema.automationRun.status} order by ${schema.automationRun.startedAt} desc))[1]`,
    })
    .from(schema.automationRun)
    .where(and(eq(schema.automationRun.workspaceId, ctx.workspaceId), inArray(schema.automationRun.ruleId, ids)))
    .groupBy(schema.automationRun.ruleId);
  const byRule = new Map(stats.map((s) => [s.ruleId, s]));
  return rules.map((r) => ({
    rule: r,
    trigger: describeTrigger(r),
    runs: byRule.get(r.id)?.total ?? 0,
    failed: byRule.get(r.id)?.failed ?? 0,
    lastStatus: byRule.get(r.id)?.lastStatus ?? null,
  }));
}

export async function getRule(ctx: Ctx, id: string) {
  assertCan(ctx, "read", "settings");
  const [r] = await getDb()
    .select()
    .from(schema.automationRule)
    .where(and(eq(schema.automationRule.id, id), scoped(schema.automationRule, ctx)));
  if (!r) return null;
  return {
    rule: r,
    trigger: describeTrigger(r),
    source: ruleSource(r),
    next: r.triggerKind === "schedule" && r.cron && r.active ? nextRuns(r.cron, new Date(), 3) : [],
  };
}

export async function listRuns(ctx: Ctx, ruleId: string, limit = 50) {
  assertCan(ctx, "read", "settings");
  return getDb()
    .select()
    .from(schema.automationRun)
    .where(and(eq(schema.automationRun.workspaceId, ctx.workspaceId), eq(schema.automationRun.ruleId, ruleId)))
    .orderBy(desc(schema.automationRun.startedAt))
    .limit(limit);
}

export async function listEndpoints(ctx: Ctx) {
  assertCan(ctx, "read", "settings");
  const db = getDb();
  const rows = await db
    .select({
      id: schema.webhookEndpoint.id,
      name: schema.webhookEndpoint.name,
      direction: schema.webhookEndpoint.direction,
      url: schema.webhookEndpoint.url,
      active: schema.webhookEndpoint.active,
      createdAt: schema.webhookEndpoint.createdAt,
    })
    .from(schema.webhookEndpoint)
    .where(scoped(schema.webhookEndpoint, ctx))
    .orderBy(desc(schema.webhookEndpoint.createdAt));
  if (!rows.length) return [];
  const last = await db
    .select({
      endpointId: schema.webhookDelivery.endpointId,
      n: sql<number>`count(*)::int`,
      at: sql<Date | null>`max(${schema.webhookDelivery.at})`,
      lastCode: sql<number | null>`(array_agg(${schema.webhookDelivery.statusCode} order by ${schema.webhookDelivery.at} desc))[1]`,
    })
    .from(schema.webhookDelivery)
    .where(
      and(
        eq(schema.webhookDelivery.workspaceId, ctx.workspaceId),
        inArray(
          schema.webhookDelivery.endpointId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .groupBy(schema.webhookDelivery.endpointId);
  const by = new Map(last.map((l) => [l.endpointId, l]));
  return rows.map((r) => ({ ...r, deliveries: by.get(r.id)?.n ?? 0, lastAt: by.get(r.id)?.at ? new Date(by.get(r.id)?.at as Date) : null, lastCode: by.get(r.id)?.lastCode ?? null }));
}

/** Todo lo que necesita el constructor (serializable; la UI no importa módulos). */
export async function builderMeta(ctx: Ctx) {
  const endpoints = (await listEndpoints(ctx)).filter((e) => e.direction === "out");
  return {
    events: EVENT_CATALOG,
    entityFields: ENTITY_FIELDS,
    entityKeys: ENTITY_KEYS,
    commonFields: COMMON_FIELDS,
    sources: Object.entries(SCHEDULE_SOURCES).map(([key, s]) => ({ key, ...s })),
    actions: Object.entries(ACTION_TYPES).map(([key, a]) => ({ key, ...a })),
    ops: Object.entries(CONDITION_OPS).map(([key, label]) => ({ key, label })),
    presets: SCHEDULE_PRESETS,
    weekdays: WEEKDAYS,
    endpoints: endpoints.map((e) => ({ id: e.id, name: e.name, active: e.active })),
    taskStatuses: Object.entries(L.taskStatus).map(([value, label]) => ({ value, label })),
    projectStatuses: Object.entries(L.projectStatus)
      .filter(([v]) => v !== "archived")
      .map(([value, label]) => ({ value, label })),
  };
}
export type BuilderMeta = Awaited<ReturnType<typeof builderMeta>>;

export const templates = () => TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description, trigger: t.rule.triggerKind, actions: t.rule.actions.map((a) => ACTION_TYPES[a.type]?.label ?? a.type) }));
export const runStatus = RUN_STATUS;
