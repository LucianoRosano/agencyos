import type { BrainEdge, BrainGraph, BrainNode, BrainNodeType } from "@agencyos/modules/brain/types";

export type { BrainEdge, BrainGraph, BrainNode, BrainNodeType };

/** Colores por tipo (contexto C1). Siempre acompañados de forma: persona = anillo; el resto, punto luminoso. */
export const TYPE_COLOR: Record<BrainNodeType, string> = {
  project: "#7C5CFF",
  client: "#22D3EE",
  note: "#C9D1E0",
  contact: "#34D399",
  course: "#FBBF24",
  task: "#60A5FA",
  space: "#8A93A6",
};

export const TYPE_LABEL: Record<BrainNodeType, { one: string; many: string }> = {
  project: { one: "Proyecto", many: "Proyectos" },
  client: { one: "Cliente", many: "Clientes" },
  note: { one: "Nota", many: "Notas" },
  contact: { one: "Persona", many: "Personas" },
  course: { one: "Materia", many: "Facultad" },
  task: { one: "Tarea", many: "Tareas" },
  space: { one: "Espacio", many: "Espacios" },
};

/** Orden de los chips de filtro. Las tareas solo se cargan si se activa su filtro. */
export const FILTER_TYPES: BrainNodeType[] = ["project", "client", "note", "contact", "course", "task"];

export const PULSE_MS = 7 * 86_400_000;
export const isPulsing = (n: BrainNode, now: number) => n.type !== "space" && now - n.activeAt < PULSE_MS && !n.dim;

/** Vecindario (BFS) de profundidad 1–3, sin pasar por anclas de espacio. */
export function neighborhood(edges: BrainEdge[], start: string, depth: number): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind === "space") continue;
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

export function normText(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Hash determinístico [0,1) para posiciones iniciales y fases del pulso. */
export function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

export function relTime(ms: number, now = Date.now()) {
  if (!ms) return "—";
  const d = Math.floor((now - ms) / 86_400_000);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const m = Math.floor(d / 30);
  if (m < 12) return `hace ${m} ${m === 1 ? "mes" : "meses"}`;
  const y = Math.floor(m / 12);
  return `hace ${y} ${y === 1 ? "año" : "años"}`;
}

const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
export function monthLabel(ms: number, withYear = true) {
  const d = new Date(ms);
  const parts = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Buenos_Aires", month: "numeric", year: "numeric" }).formatToParts(d);
  const m = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  return withYear ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1] ?? "";
}
