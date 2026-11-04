import { type Ctx, diffDays, L, label, todayAR, toISODateAR } from "@agencyos/core";
import { schema } from "@agencyos/db";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { getDb, scoped } from "../shared/db";
import { entityHref } from "../shared/entities";
import type { BrainCluster, BrainEdge, BrainGraph, BrainLayout, BrainNode, BrainNodeType } from "./types";

const CLIENT_COLOR = "#22D3EE";
const ms = (d: Date | null | undefined) => (d ? d.getTime() : 0);

/** Vecindario (BFS) de profundidad 1–3 alrededor de un nodo. */
export function neighborhood(edges: BrainEdge[], start: string, depth: number, skip?: (key: string) => boolean): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (skip?.(e.s) || skip?.(e.t)) continue;
    adj.set(e.s, [...(adj.get(e.s) ?? []), e.t]);
    adj.set(e.t, [...(adj.get(e.t) ?? []), e.s]);
  }
  const seen = new Set([start]);
  let frontier = [start];
  for (let d = 0; d < Math.max(1, Math.min(3, depth)); d++) {
    const next: string[] = [];
    for (const k of frontier) {
      for (const n of adj.get(k) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return seen;
}

/**
 * Grafo completo del Cerebro con datos reales: notas, proyectos, clientes, contactos y materias
 * (tareas solo si se piden). Aristas: `link` (wikilink, mención, relacionado…) y pertenencia.
 * Los espacios entran como nodos ancla invisibles para agrupar constelaciones.
 */
export async function getBrainGraph(
  ctx: Ctx & { workspace?: { settings?: { stalledDays?: number } } },
  opts: { includeTasks?: boolean } = {},
): Promise<BrainGraph> {
  const db = getDb();
  const stalledDays = ctx.workspace?.settings?.stalledDays ?? 14;
  const today = todayAR();
  const [spaces, clients, projects, contacts, clientContacts, courses, notes, links, tasks] = await Promise.all([
    db
      .select({ id: schema.space.id, name: schema.space.name, color: schema.space.color, kind: schema.space.kind })
      .from(schema.space)
      .where(scoped(schema.space, ctx)),
    db
      .select({
        id: schema.client.id,
        name: schema.client.name,
        status: schema.client.status,
        spaceId: schema.client.spaceId,
        industry: schema.client.industry,
        createdAt: schema.client.createdAt,
        updatedAt: schema.client.updatedAt,
        lastActivityAt: schema.client.lastActivityAt,
      })
      .from(schema.client)
      .where(and(scoped(schema.client, ctx), notInArray(schema.client.status, ["archived"]))),
    db
      .select({
        id: schema.project.id,
        name: schema.project.name,
        status: schema.project.status,
        spaceId: schema.project.spaceId,
        clientId: schema.project.clientId,
        progress: schema.project.progress,
        nextAction: schema.project.nextAction,
        createdAt: schema.project.createdAt,
        lastActivityAt: schema.project.lastActivityAt,
      })
      .from(schema.project)
      .where(and(scoped(schema.project, ctx), notInArray(schema.project.status, ["archived"]))),
    db
      .select({
        id: schema.contact.id,
        name: schema.contact.name,
        role: schema.contact.role,
        createdAt: schema.contact.createdAt,
        updatedAt: schema.contact.updatedAt,
      })
      .from(schema.contact)
      .where(scoped(schema.contact, ctx)),
    db
      .select({ clientId: schema.clientContact.clientId, contactId: schema.clientContact.contactId, isPrimary: schema.clientContact.isPrimary })
      .from(schema.clientContact)
      .where(eq(schema.clientContact.workspaceId, ctx.workspaceId)),
    db
      .select({
        id: schema.course.id,
        name: schema.course.name,
        status: schema.course.status,
        spaceId: schema.course.spaceId,
        term: schema.course.term,
        createdAt: schema.course.createdAt,
        updatedAt: schema.course.updatedAt,
      })
      .from(schema.course)
      .where(scoped(schema.course, ctx)),
    db
      .select({
        id: schema.note.id,
        title: schema.note.title,
        spaceId: schema.note.spaceId,
        folderPath: schema.note.folderPath,
        entityType: schema.note.entityType,
        entityId: schema.note.entityId,
        isDaily: schema.note.isDaily,
        createdAt: schema.note.createdAt,
        updatedAt: schema.note.updatedAt,
      })
      .from(schema.note)
      .where(scoped(schema.note, ctx)),
    db
      .select({ fromType: schema.link.fromType, fromId: schema.link.fromId, toType: schema.link.toType, toId: schema.link.toId, kind: schema.link.kind })
      .from(schema.link)
      .where(eq(schema.link.workspaceId, ctx.workspaceId)),
    opts.includeTasks
      ? db
          .select({
            id: schema.task.id,
            title: schema.task.title,
            status: schema.task.status,
            spaceId: schema.task.spaceId,
            projectId: schema.task.projectId,
            dueDate: schema.task.dueDate,
            createdAt: schema.task.createdAt,
            updatedAt: schema.task.updatedAt,
          })
          .from(schema.task)
          .where(and(scoped(schema.task, ctx), inArray(schema.task.status, ["todo", "doing", "waiting", "done"])))
          .limit(3000)
      : Promise.resolve([]),
  ]);

  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const nodes = new Map<string, BrainNode>();
  const edges: BrainEdge[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (s: string, t: string, kind: string) => {
    if (s === t) return;
    const k = s < t ? `${s}|${t}` : `${t}|${s}`;
    if (edgeKeys.has(k)) return;
    edgeKeys.add(k);
    edges.push({ s, t, kind });
  };
  const add = (n: Omit<BrainNode, "key" | "href"> & { href?: string }) => {
    const key = `${n.type}:${n.id}`;
    nodes.set(key, { ...n, key, href: n.href ?? entityHref(n.type, n.id) });
    return key;
  };
  const spaceName = (id: string | null) => (id ? (spaceById.get(id)?.name ?? null) : null);

  for (const c of clients) {
    add({
      type: "client",
      id: c.id,
      label: c.name,
      spaceId: c.spaceId,
      cluster: `client:${c.id}`,
      status: c.status,
      statusLabel: label(L.clientStatus, c.status),
      subtitle: [c.industry, spaceName(c.spaceId)].filter(Boolean).join(" · ") || null,
      createdAt: ms(c.createdAt),
      activeAt: Math.max(ms(c.lastActivityAt), ms(c.updatedAt)),
      dim: c.status === "finished",
      progress: null,
      nextAction: null,
    });
  }
  for (const p of projects) {
    const stalled = p.status === "in_progress" && diffDays(today, toISODateAR(p.lastActivityAt)) > stalledDays;
    const client = p.clientId ? clientById.get(p.clientId) : undefined;
    const key = add({
      type: "project",
      id: p.id,
      label: p.name,
      spaceId: p.spaceId,
      cluster: client ? `client:${client.id}` : `space:${p.spaceId}`,
      status: p.status,
      statusLabel: stalled ? "Frenado" : label(L.projectStatus, p.status),
      subtitle: client?.name ?? spaceName(p.spaceId),
      createdAt: ms(p.createdAt),
      activeAt: ms(p.lastActivityAt),
      dim: stalled || ["paused", "blocked", "done"].includes(p.status),
      progress: p.progress,
      nextAction: p.nextAction,
    });
    if (client) addEdge(key, `client:${client.id}`, "belongs");
    else addEdge(key, `space:${p.spaceId}`, "space");
  }
  const contactClient = new Map<string, string>();
  for (const cc of clientContacts.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)))
    if (!contactClient.has(cc.contactId) && clientById.has(cc.clientId)) contactClient.set(cc.contactId, cc.clientId);
  for (const c of contacts) {
    const clientId = contactClient.get(c.id);
    add({
      type: "contact",
      id: c.id,
      label: c.name,
      spaceId: clientId ? (clientById.get(clientId)?.spaceId ?? null) : null,
      cluster: clientId ? `client:${clientId}` : null,
      status: null,
      statusLabel: null,
      subtitle: [c.role, clientId ? clientById.get(clientId)?.name : null].filter(Boolean).join(" · ") || null,
      createdAt: ms(c.createdAt),
      activeAt: ms(c.updatedAt),
      dim: false,
      progress: null,
      nextAction: null,
    });
  }
  for (const cc of clientContacts) if (clientById.has(cc.clientId)) addEdge(`contact:${cc.contactId}`, `client:${cc.clientId}`, "belongs");
  for (const c of courses) {
    const key = add({
      type: "course",
      id: c.id,
      label: c.name,
      spaceId: c.spaceId,
      cluster: c.spaceId ? `space:${c.spaceId}` : null,
      status: c.status,
      statusLabel: label(L.courseStatus, c.status),
      subtitle: [c.term, spaceName(c.spaceId)].filter(Boolean).join(" · ") || null,
      createdAt: ms(c.createdAt),
      activeAt: ms(c.updatedAt),
      dim: ["aprobada", "abandonada"].includes(c.status),
      progress: null,
      nextAction: null,
    });
    if (c.spaceId) addEdge(key, `space:${c.spaceId}`, "space");
  }
  for (const t of tasks) {
    const project = t.projectId ? projectById.get(t.projectId) : undefined;
    const key = add({
      type: "task",
      id: t.id,
      label: t.title,
      spaceId: t.spaceId,
      cluster: project ? (nodes.get(`project:${project.id}`)?.cluster ?? null) : `space:${t.spaceId}`,
      status: t.status,
      statusLabel: label(L.taskStatus, t.status),
      subtitle: project?.name ?? spaceName(t.spaceId),
      createdAt: ms(t.createdAt),
      activeAt: ms(t.updatedAt),
      dim: t.status === "done",
      progress: null,
      nextAction: null,
    });
    if (project) addEdge(key, `project:${project.id}`, "belongs");
    else addEdge(key, `space:${t.spaceId}`, "space");
  }
  for (const n of notes) {
    const ownerKey = n.entityType && n.entityId ? `${n.entityType}:${n.entityId}` : null;
    const owner = ownerKey ? nodes.get(ownerKey) : undefined;
    const key = add({
      type: "note",
      id: n.id,
      label: n.title,
      spaceId: n.spaceId ?? owner?.spaceId ?? null,
      cluster: owner?.cluster ?? (n.spaceId ? `space:${n.spaceId}` : null),
      status: null,
      statusLabel: n.isDaily ? "Diaria" : null,
      subtitle: [n.folderPath, owner?.label ?? spaceName(n.spaceId)].filter(Boolean).join(" · ") || null,
      createdAt: ms(n.createdAt),
      activeAt: ms(n.updatedAt),
      dim: false,
      progress: null,
      nextAction: null,
    });
    if (owner && ownerKey) addEdge(key, ownerKey, "belongs");
  }
  for (const l of links) {
    const s = `${l.fromType}:${l.fromId}`;
    const t = `${l.toType}:${l.toId}`;
    if (nodes.has(s) && nodes.has(t)) addEdge(s, t, l.kind);
  }
  // Notas sueltas (sin enlaces ni entidad) se anclan a su espacio para caer en su constelación.
  const touched = new Set(edges.flatMap((e) => [e.s, e.t]));
  for (const n of notes) if (!touched.has(`note:${n.id}`) && n.spaceId) addEdge(`note:${n.id}`, `space:${n.spaceId}`, "space");

  // Anclas de espacio (invisibles) solo si tienen miembros.
  const usedSpaces = new Set(edges.filter((e) => e.kind === "space").map((e) => e.t));
  for (const s of spaces) {
    if (!usedSpaces.has(`space:${s.id}`)) continue;
    add({
      type: "space",
      id: s.id,
      label: s.name,
      href: `/espacios/${s.id}`,
      spaceId: s.id,
      cluster: `space:${s.id}`,
      status: null,
      statusLabel: null,
      subtitle: null,
      createdAt: 0,
      activeAt: 0,
      dim: false,
      progress: null,
      nextAction: null,
    });
  }
  const finalEdges = edges.filter((e) => nodes.has(e.s) && nodes.has(e.t));

  const clusters: BrainCluster[] = [
    ...clients.map((c) => ({ key: `client:${c.id}`, label: c.name, color: CLIENT_COLOR, done: c.status === "finished" })),
    ...spaces.map((s) => ({ key: `space:${s.id}`, label: s.name, color: s.color, done: false })),
  ];
  return {
    nodes: [...nodes.values()],
    edges: finalEdges,
    clusters,
    spaces: spaces.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    generatedAt: Date.now(),
  };
}

/** Grafo local (profundidad 1–3) alrededor de una entidad, para fichas y notas. */
export async function getLocalGraph(ctx: Ctx, type: string, id: string, depth = 1): Promise<BrainGraph & { center: string }> {
  const full = await getBrainGraph(ctx, { includeTasks: type === "task" });
  const center = `${type}:${id}`;
  if (!full.nodes.some((n) => n.key === center)) return { ...full, nodes: [], edges: [], center };
  const keep = neighborhood(
    full.edges.filter((e) => e.kind !== "space"),
    center,
    depth,
  );
  const nodes = full.nodes.filter((n) => keep.has(n.key));
  const edges = full.edges.filter((e) => keep.has(e.s) && keep.has(e.t));
  return { ...full, nodes, edges, center };
}

export async function getLayout(ctx: Ctx, viewKey: string): Promise<BrainLayout> {
  const [row] = await getDb()
    .select()
    .from(schema.graphLayout)
    .where(and(eq(schema.graphLayout.workspaceId, ctx.workspaceId), eq(schema.graphLayout.viewKey, viewKey)));
  return row ? { positions: row.positions, nodeCount: row.nodeCount, computedAt: row.computedAt.getTime() } : null;
}

export type { BrainNodeType };
