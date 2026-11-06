import { diffDays, todayAR } from "@agencyos/core";
import { type DbOrTx, schema } from "@agencyos/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { scoped } from "../shared/db";
import { ENTITY_KEYS } from "./catalog";

/**
 * Contexto de datos de una ejecución: evento + entidad cargada + relacionadas, con claves en español
 * (`tarea.prioridad`, `proyecto.estado`, `cliente.nombre`…). Es lo que ven las condiciones y las plantillas {{ }}.
 * Lecturas de solo consulta, siempre filtradas por workspace.
 */
export type TriggerEvent = {
  id?: string | null;
  type: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  actorType?: string;
  actorId?: string | null;
  occurredAt?: Date | string;
};

export type RunData = Record<string, unknown> & { entidad?: Record<string, unknown> };

type Ws = { workspaceId: string };
type Obj = Record<string, unknown>;

async function one<T>(rows: Promise<T[]>): Promise<T | undefined> {
  return (await rows)[0];
}

async function loadTask(db: DbOrTx, ws: Ws, id: string) {
  const r = await one(
    db
      .select()
      .from(schema.task)
      .where(and(scoped(schema.task, ws, { withArchived: true }), eq(schema.task.id, id))),
  );
  if (!r) return null;
  const today = todayAR();
  return {
    obj: {
      id: r.id,
      titulo: r.title,
      nombre: r.title,
      estado: r.status,
      prioridad: r.priority,
      vence: r.dueDate,
      dias_vencida: r.dueDate && r.dueDate < today ? diffDays(today, r.dueDate) : 0,
      proyecto_id: r.projectId,
    },
    projectId: r.projectId,
  };
}

async function loadProject(db: DbOrTx, ws: Ws, id: string) {
  const r = await one(
    db
      .select()
      .from(schema.project)
      .where(and(scoped(schema.project, ws, { withArchived: true }), eq(schema.project.id, id))),
  );
  if (!r) return null;
  return {
    obj: {
      id: r.id,
      nombre: r.name,
      estado: r.status,
      tipo: r.kind,
      prioridad: r.priority,
      objetivo: r.goal,
      siguiente_accion: r.nextAction,
      fecha_objetivo: r.targetDate,
      progreso: r.progress,
      cliente_id: r.clientId,
    },
    clientId: r.clientId,
  };
}

async function loadClient(db: DbOrTx, ws: Ws, id: string) {
  const r = await one(
    db
      .select()
      .from(schema.client)
      .where(and(scoped(schema.client, ws, { withArchived: true }), eq(schema.client.id, id))),
  );
  if (!r) return null;
  const [c] = await db
    .select({ name: schema.contact.name, email: schema.contact.email })
    .from(schema.clientContact)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.clientContact.contactId))
    .where(and(eq(schema.clientContact.clientId, id), eq(schema.clientContact.workspaceId, ws.workspaceId), scoped(schema.contact, ws)))
    .orderBy(desc(schema.clientContact.isPrimary), asc(schema.contact.createdAt))
    .limit(1);
  return {
    obj: {
      id: r.id,
      nombre: r.name,
      estado: r.status,
      relacion: r.relationship,
      rubro: r.industry,
      ciudad: r.city,
      contacto: c?.name ?? null,
      email: c?.email ?? null,
    },
  };
}

async function loadOpportunity(db: DbOrTx, ws: Ws, id: string) {
  const r = await one(
    db
      .select()
      .from(schema.opportunity)
      .where(and(scoped(schema.opportunity, ws, { withArchived: true }), eq(schema.opportunity.id, id))),
  );
  if (!r) return null;
  return {
    obj: {
      id: r.id,
      titulo: r.title,
      nombre: r.title,
      etapa: r.stage,
      valor: r.valueAmount,
      moneda: r.valueCurrency,
      probabilidad: r.probability,
      proxima_accion: r.nextAction,
    },
    clientId: r.clientId,
  };
}

async function loadQuote(db: DbOrTx, ws: Ws, id: string) {
  const r = await one(
    db
      .select()
      .from(schema.quote)
      .where(and(scoped(schema.quote, ws, { withArchived: true }), eq(schema.quote.id, id))),
  );
  if (!r) return null;
  return {
    obj: { id: r.id, numero: r.number, titulo: r.title, nombre: `${r.number} · ${r.title}`, estado: r.status },
    clientId: r.clientId,
    projectId: r.projectId,
  };
}

async function loadReceivable(db: DbOrTx, ws: Ws, id: string) {
  const r = await one(
    db
      .select()
      .from(schema.receivable)
      .where(and(scoped(schema.receivable, ws, { withArchived: true }), eq(schema.receivable.id, id))),
  );
  if (!r) return null;
  return {
    obj: { id: r.id, concepto: r.concept, nombre: r.concept, monto: r.amount, moneda: r.currency, vence: r.dueDate, estado: r.status },
    clientId: r.clientId,
    projectId: r.projectId,
  };
}

async function loadDomain(db: DbOrTx, ws: Ws, id: string) {
  const r = await one(
    db
      .select()
      .from(schema.domain)
      .where(and(scoped(schema.domain, ws, { withArchived: true }), eq(schema.domain.id, id))),
  );
  if (!r) return null;
  return {
    obj: {
      id: r.id,
      nombre: r.name,
      vence: r.expiresOn,
      dias_para_vencer: r.expiresOn ? diffDays(r.expiresOn, todayAR()) : null,
      registrador: r.registrar,
      renovacion_automatica: r.autoRenew,
    },
    clientId: r.clientId,
    siteId: r.siteId,
  };
}

async function loadSite(db: DbOrTx, ws: Ws, id: string) {
  const r = await one(
    db
      .select()
      .from(schema.site)
      .where(and(scoped(schema.site, ws, { withArchived: true }), eq(schema.site.id, id))),
  );
  if (!r) return null;
  return { obj: { id: r.id, nombre: r.name, url: r.prodUrl ?? r.stagingUrl, estado: r.publicationStatus }, clientId: r.clientId, projectId: r.projectId };
}

async function loadAudit(db: DbOrTx, ws: Ws, id: string) {
  const r = await one(
    db
      .select()
      .from(schema.seoAudit)
      .where(and(scoped(schema.seoAudit, ws, { withArchived: true }), eq(schema.seoAudit.id, id))),
  );
  if (!r) return null;
  return { obj: { id: r.id, url: r.rootUrl, nombre: r.rootUrl, puntaje: r.score, estado: r.status }, siteId: r.siteId };
}

async function loadRepository(db: DbOrTx, ws: Ws, id: string) {
  const r = await one(
    db
      .select()
      .from(schema.repository)
      .where(and(scoped(schema.repository, ws, { withArchived: true }), eq(schema.repository.id, id))),
  );
  if (!r) return null;
  return { obj: { id: r.id, nombre: r.fullName, lenguaje: r.language } };
}

async function loadWebhook(db: DbOrTx, ws: Ws, id: string) {
  const r = await one(
    db
      .select()
      .from(schema.webhookEndpoint)
      .where(and(scoped(schema.webhookEndpoint, ws, { withArchived: true }), eq(schema.webhookEndpoint.id, id))),
  );
  if (!r) return null;
  return { obj: { id: r.id, nombre: r.name } };
}

type Loaded = { obj: Obj; clientId?: string | null; projectId?: string | null; siteId?: string | null } | null;

const LOADERS: Record<string, (db: DbOrTx, ws: Ws, id: string) => Promise<Loaded>> = {
  task: loadTask,
  project: loadProject,
  client: loadClient,
  opportunity: loadOpportunity,
  quote: loadQuote,
  receivable: loadReceivable,
  domain: loadDomain,
  site: loadSite,
  seo_audit: loadAudit,
  repository: loadRepository,
  webhook_endpoint: loadWebhook,
};

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Arma el contexto de datos para un evento (o un elemento de una programación). */
export async function buildRunData(db: DbOrTx, workspaceId: string, ev: TriggerEvent): Promise<RunData> {
  const ws = { workspaceId };
  const data: RunData = {
    evento: {
      id: ev.id ?? null,
      tipo: ev.type,
      actor: ev.actorType === "user" ? "persona" : ev.actorType === "agent" ? "Claude (MCP)" : "sistema",
      fecha: ev.occurredAt ? new Date(ev.occurredAt).toISOString() : new Date().toISOString(),
    },
    payload: ev.payload ?? {},
    hoy: todayAR(),
  };
  const ek = ENTITY_KEYS[ev.entityType];
  const loader = LOADERS[ev.entityType];
  if (!ek || !loader || !ev.entityId) return data;
  const main = await loader(db, ws, ev.entityId);
  if (!main) return data;
  data[ek.key] = main.obj;
  data.entidad = { ...main.obj, tipo: ev.entityType };

  let projectId = main.projectId ?? (isUuid(ev.payload?.projectId) ? (ev.payload.projectId as string) : null);
  let clientId = main.clientId ?? (isUuid(ev.payload?.clientId) ? (ev.payload.clientId as string) : null);
  if (main.siteId && !data.sitio) {
    const s = await loadSite(db, ws, main.siteId);
    if (s) {
      data.sitio = s.obj;
      projectId = projectId ?? s.projectId ?? null;
      clientId = clientId ?? s.clientId ?? null;
    }
  }
  if (projectId && !data.proyecto) {
    const p = await loadProject(db, ws, projectId);
    if (p) {
      data.proyecto = p.obj;
      clientId = clientId ?? p.clientId ?? null;
    }
  }
  if (clientId && !data.cliente) {
    const c = await loadClient(db, ws, clientId);
    if (c) data.cliente = c.obj;
  }
  return data;
}
