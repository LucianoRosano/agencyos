"use client";

import { useEffect, useRef } from "react";
import type { GraphApi, Insets } from "./graph-canvas";
import type { BrainGraph } from "./model";
import { type BrainTheme, brainPalette } from "./palette";

/**
 * Modo 3D del Cerebro (3d-force-graph + three), cargado en diferido SOLO al activarlo.
 * Mismos nodos, aristas, colores y filtros (`visible`) que la vista 2D; clic → mismo panel.
 * Con `prefers-reduced-motion` el layout se calcula antes de dibujar y la cámara no anima.
 */

type Node3D = { id: string; label: string; type: string; dim: boolean; val: number; x?: number; y?: number; z?: number };
type Link3D = { source: string; target: string; kind: string };
type FG = import("3d-force-graph").ForceGraph3DInstance<Node3D, Link3D>;
type FGCtor = new (el: HTMLElement, cfg?: import("3d-force-graph").ConfigOptions) => FG;

export type Graph3DProps = {
  graph: BrainGraph;
  visible: Set<string>;
  selected: string | null;
  onSelect: (key: string | null) => void;
  onReady?: (api: GraphApi) => void;
  theme?: BrainTheme;
};

const BASE: Record<string, number> = { client: 6, project: 4.5, course: 4.5, contact: 2.6, note: 2, task: 1.6 };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  return `rgba(${Number.parseInt(h.slice(0, 2), 16)},${Number.parseInt(h.slice(2, 4), 16)},${Number.parseInt(h.slice(4, 6), 16)},${a})`;
}

export default function Graph3D({ graph, visible, selected, onSelect, onReady, theme = "light" }: Graph3DProps) {
  const pal = brainPalette(theme);
  const host = useRef<HTMLDivElement>(null);
  const fgRef = useRef<FG | null>(null);
  const nodes = useRef(new Map<string, Node3D>());
  const state = useRef({ selected, onSelect, reduced: false });
  state.current.selected = selected;
  state.current.onSelect = onSelect;

  // biome-ignore lint/correctness/useExhaustiveDependencies: se monta una vez por grafo; filtros y selección se aplican aparte
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let ro: ResizeObserver | null = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    state.current.reduced = reduced;
    const degree = new Map<string, number>();
    for (const e of graph.edges) {
      if (e.kind === "space") continue;
      degree.set(e.s, (degree.get(e.s) ?? 0) + 1);
      degree.set(e.t, (degree.get(e.t) ?? 0) + 1);
    }
    nodes.current = new Map(
      graph.nodes
        .filter((n) => n.type !== "space")
        .map((n) => [n.key, { id: n.key, label: n.label, type: n.type, dim: Boolean(n.dim), val: (BASE[n.type] ?? 2) + Math.sqrt(degree.get(n.key) ?? 0) }]),
    );

    void import("3d-force-graph").then((mod) => {
      if (disposed) return;
      const ForceGraph3D = mod.default as unknown as FGCtor;
      const fg = new ForceGraph3D(el, { controlType: "orbit", rendererConfig: { antialias: true, alpha: true, powerPreference: "low-power" } })
        .backgroundColor("rgba(0,0,0,0)")
        .showNavInfo(false)
        .width(el.clientWidth)
        .height(el.clientHeight)
        .nodeId("id")
        .nodeRelSize(3)
        .nodeResolution(14)
        .nodeOpacity(0.95)
        .nodeLabel((n) => `<span class="brain-3d-label">${esc(n.label)}</span>`)
        .linkColor(() => pal.edge)
        .linkWidth(0)
        .linkOpacity(0.5)
        .enableNodeDrag(!reduced)
        .onNodeClick((n) => state.current.onSelect(n.id))
        .onBackgroundClick(() => state.current.onSelect(null));
      if (reduced) fg.warmupTicks(160).cooldownTicks(0);
      else fg.cooldownTime(6000);
      fgRef.current = fg;
      applyStyle();
      applyData(true);
      ro = new ResizeObserver(() => fg.width(el.clientWidth).height(el.clientHeight));
      ro.observe(el);
      const ms = (n: number) => (state.current.reduced ? 0 : n);
      const scaleCam = (k: number) => {
        const c = fg.cameraPosition();
        fg.cameraPosition({ x: c.x * k, y: c.y * k, z: c.z * k }, undefined, ms(300));
      };
      const api: GraphApi = {
        zoomIn: () => scaleCam(0.75),
        zoomOut: () => scaleCam(1.33),
        fit: (keys?: string[], _insets?: Insets) => {
          const only = keys ? new Set(keys) : null;
          fg.zoomToFit(ms(600), 40, only ? (n) => only.has(n.id) : undefined);
        },
        flyTo: (key: string) => {
          const n = nodes.current.get(key);
          if (!n || n.x === undefined) return;
          const dist = 90;
          const r = Math.hypot(n.x ?? 0, n.y ?? 0, n.z ?? 0) || 1;
          const k = 1 + dist / r;
          fg.cameraPosition({ x: (n.x ?? 0) * k, y: (n.y ?? 0) * k, z: (n.z ?? 0) * k }, { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 }, ms(900));
        },
      };
      onReady?.(api);
      setTimeout(() => !disposed && fg.zoomToFit(ms(500), 40), reduced ? 50 : 1200);
    });
    return () => {
      disposed = true;
      ro?.disconnect();
      fgRef.current?._destructor();
      fgRef.current = null;
      el.replaceChildren();
    };
  }, [graph, theme]);

  function applyStyle() {
    const fg = fgRef.current;
    if (!fg) return;
    const sel = state.current.selected;
    fg.nodeColor((n) => {
      const c = pal.type[n.type as keyof typeof pal.type] ?? "#857B70";
      if (sel && n.id !== sel) return hexA(c, n.dim ? 0.35 : 0.75);
      return n.dim ? hexA(c, 0.5) : c;
    }).nodeVal((n) => (n.id === sel ? n.val * 2.2 : n.val));
  }

  function applyData(first = false) {
    const fg = fgRef.current;
    if (!fg) return;
    const ns = [...nodes.current.values()].filter((n) => visible.has(n.id));
    const keep = new Set(ns.map((n) => n.id));
    const links: Link3D[] = [];
    const seen = new Set<string>();
    for (const e of graph.edges) {
      if (e.kind === "space" || !keep.has(e.s) || !keep.has(e.t)) continue;
      const k = e.s < e.t ? `${e.s}|${e.t}` : `${e.t}|${e.s}`;
      if (seen.has(k)) continue;
      seen.add(k);
      links.push({ source: e.s, target: e.t, kind: e.kind });
    }
    fg.graphData({ nodes: ns, links });
    if (!first && state.current.reduced) fg.cooldownTicks(0);
  }

  // filtros (tipo, espacio, etiqueta, línea de tiempo, grafo local)
  // biome-ignore lint/correctness/useExhaustiveDependencies: applyData lee `visible` del render actual
  useEffect(() => {
    applyData();
  }, [visible]);
  // selección
  // biome-ignore lint/correctness/useExhaustiveDependencies: applyStyle lee la selección del ref
  useEffect(() => {
    applyStyle();
  }, [selected]);

  return <div ref={host} className="absolute inset-0" data-testid="brain-3d" aria-hidden="true" />;
}
