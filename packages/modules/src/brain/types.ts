/** Tipos del grafo del Cerebro. Sin imports: se pueden usar (como `import type`) desde componentes cliente. */

export type BrainNodeType = "project" | "client" | "note" | "contact" | "course" | "task" | "space";

export type BrainNode = {
  /** Clave única en el grafo: `${type}:${id}`. */
  key: string;
  type: BrainNodeType;
  id: string;
  label: string;
  href: string;
  spaceId: string | null;
  /** Constelación: `client:<id>` o `space:<id>`. */
  cluster: string | null;
  status: string | null;
  statusLabel: string | null;
  /** Texto secundario (cliente, espacio, rol…). */
  subtitle: string | null;
  createdAt: number;
  /** Última actividad (ms) para el pulso. */
  activeAt: number;
  /** Frenado o terminado: se dibuja apagado. */
  dim: boolean;
  progress: number | null;
  nextAction: string | null;
};

export type BrainEdge = { s: string; t: string; kind: string };

export type BrainCluster = { key: string; label: string; color: string; done: boolean };

export type BrainGraph = {
  nodes: BrainNode[];
  edges: BrainEdge[];
  clusters: BrainCluster[];
  spaces: { id: string; name: string; color: string }[];
  generatedAt: number;
};

export type BrainLayout = { positions: Record<string, [number, number]>; nodeCount: number; computedAt: number } | null;
