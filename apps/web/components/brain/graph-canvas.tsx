"use client";

import Graph from "graphology";
import { inferSettings } from "graphology-layout-forceatlas2";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import { useEffect, useRef } from "react";
import Sigma from "sigma";
import { sdfCircle } from "sigma/rendering";
import { type BrainGraph, type BrainNode, hash01, isPulsing, TYPE_COLOR } from "./model";

/**
 * Lienzo WebGL del Cerebro (Sigma.js v4 + graphology).
 * - Nodos: "orbes" luminosos dibujados por un programa de fragmentos propio (núcleo + halo; anillo para personas).
 * - Capa 2D detrás: constelaciones (halo difuso + nombre en mayúsculas mono) por cliente/espacio.
 * - Capa 2D delante: pulso de actividad (últimos 7 días) y anillo punteado del seleccionado.
 * - Layout ForceAtlas2 en un Web Worker; posiciones guardadas para no recalcular.
 */

/** Zonas tapadas por paneles (px): la cámara centra el contenido en el área libre. */
export type Insets = { right?: number; top?: number; bottom?: number };
export type GraphApi = {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: (keys?: string[], insets?: Insets) => void;
  flyTo: (key: string, insets?: Insets) => void;
};

export type GraphCanvasProps = {
  graph: BrainGraph;
  positions: Record<string, [number, number]> | null;
  /** Claves visibles (filtros, línea de tiempo, grafo local). */
  visible: Set<string>;
  selected: string | null;
  onSelect: (key: string | null) => void;
  onReady?: (api: GraphApi) => void;
  onLayout?: (positions: Record<string, [number, number]>) => void;
  onLayoutState?: (running: boolean) => void;
  compact?: boolean;
  className?: string;
};

const CORE = 0.4; // fracción del radio del sprite ocupada por el núcleo (el resto es halo)
const BASE: Record<string, number> = { client: 6.4, project: 5, course: 5, contact: 3.4, note: 2.8, task: 2.4, space: 1 };
const DIM_MIX = 0.62;

// Programa de fragmentos: núcleo brillante + halo radial; v_ring > 0.5 vacía el centro (anillo).
const orbLayer = {
  name: "orb",
  uniforms: [],
  attributes: [
    { name: "orbColor", size: 4 as const, type: 5121 /* UNSIGNED_BYTE */, normalized: true, source: "color" },
    { name: "ring", size: 1 as const, type: 5126 /* FLOAT */, source: "ring" },
    { name: "glow", size: 1 as const, type: 5126, source: "glow" },
  ],
  glsl: /* glsl */ `
vec4 layer_orb(vec4 v_orbColor, float v_ring, float v_glow) {
  float d = length(context.uv);
  float core = ${CORE.toFixed(3)};
  float aa = max(context.aaWidth, 0.02) * 1.5;
  vec3 c = v_orbColor.rgb;
  float halo = 1.0 - smoothstep(core * 0.6, 1.0, d);
  halo = halo * halo * 0.42 * v_glow;
  vec4 col = vec4(c, halo * v_orbColor.a);
  float disc = 1.0 - smoothstep(core - aa, core + aa, d);
  if (v_ring > 0.5) {
    float inner = core * 0.58;
    disc *= smoothstep(inner - aa, inner + aa, d);
  }
  vec3 hot = mix(c, vec3(1.0), 0.45 * (1.0 - smoothstep(0.0, core * 0.7, d)) * (1.0 - v_ring));
  col = blendOver(col, vec4(hot, disc * v_orbColor.a));
  return col;
}
`,
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [Number.parseInt(h.slice(0, 2), 16), Number.parseInt(h.slice(2, 4), 16), Number.parseInt(h.slice(4, 6), 16)];
}
function mixHex(a: string, b: string, t: number) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const m = x.map((v, i) => Math.round(v * (1 - t) + (y[i] ?? 0) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

type NodeAttrs = { x: number; y: number; size: number; label: string; color: string; coreR: number; fixed?: boolean };

export default function GraphCanvas({
  graph: data,
  positions,
  visible,
  selected,
  onSelect,
  onReady,
  onLayout,
  onLayoutState,
  compact,
  className,
}: GraphCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ visible, selected, hover: null as string | null, onSelect, onLayout, onLayoutState });
  state.current.onSelect = onSelect;
  state.current.onLayout = onLayout;
  state.current.onLayoutState = onLayoutState;
  const sigmaRef = useRef<{ refresh: (o?: { skipIndexation?: boolean }) => unknown } | null>(null);
  const meta = useRef(new Map<string, BrainNode>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: se monta una vez por grafo; filtros y selección se aplican con refresh()
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const now = Date.now();
    const m = new Map(data.nodes.map((n) => [n.key, n]));
    meta.current = m;

    // --- Grafo ---
    const g = new Graph<NodeAttrs>({ type: "undirected", multi: false, allowSelfLoops: false });
    const degree = new Map<string, number>();
    for (const e of data.edges) {
      if (e.kind === "space") continue;
      degree.set(e.s, (degree.get(e.s) ?? 0) + 1);
      degree.set(e.t, (degree.get(e.t) ?? 0) + 1);
    }
    const missing: string[] = [];
    for (const n of data.nodes) {
      const p = positions?.[n.key];
      if (!p) missing.push(n.key);
      const coreR = Math.min(17, (BASE[n.type] ?? 3) + 1.55 * Math.sqrt(degree.get(n.key) ?? 0));
      g.addNode(n.key, { x: p?.[0] ?? 0, y: p?.[1] ?? 0, size: coreR / CORE, coreR, label: n.label, color: TYPE_COLOR[n.type] });
    }
    for (const e of data.edges) {
      if (!g.hasNode(e.s) || !g.hasNode(e.t) || g.hasEdge(e.s, e.t)) continue;
      g.addEdge(e.s, e.t, { kind: e.kind, weight: e.kind === "belongs" ? 3 : e.kind === "space" ? 1.5 : 1 });
    }
    // Posición inicial de los nodos nuevos: cerca de un vecino ya ubicado o alrededor del centro de su
    // constelación (centros repartidos en círculo), así ForceAtlas2 converge a constelaciones separadas.
    const placed = new Set(data.nodes.filter((n) => positions?.[n.key]).map((n) => n.key));
    const spread = Math.max(20, Math.sqrt(data.nodes.length) * 12);
    const clusterKeys = [...new Set(data.nodes.map((n) => n.cluster).filter((c): c is string => Boolean(c)))].sort();
    const centerOf = new Map(
      clusterKeys.map((c, i) => {
        const a = (i / Math.max(1, clusterKeys.length)) * Math.PI * 2;
        return [c, { x: Math.cos(a) * spread, y: Math.sin(a) * spread }] as const;
      }),
    );
    for (const k of missing) {
      const anchor = g.neighbors(k).find((nb) => placed.has(nb));
      const a = hash01(k) * Math.PI * 2;
      const r = 2 + hash01(`${k}r`) * spread * 0.25;
      const base = anchor ? g.getNodeAttributes(anchor) : (centerOf.get(m.get(k)?.cluster ?? "") ?? { x: 0, y: 0 });
      g.mergeNodeAttributes(k, { x: base.x + Math.cos(a) * (anchor ? 4 : r), y: base.y + Math.sin(a) * (anchor ? 4 : r) });
      placed.add(k);
    }

    // --- Sigma ---
    const fontFamily = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-sans").trim() || "system-ui, sans-serif";
    const sigma = new Sigma(g, container, {
      primitives: {
        nodes: {
          shapes: [sdfCircle()],
          layers: [orbLayer],
          variables: { ring: { type: "number", default: 0 }, glow: { type: "number", default: 1 } },
          label: { font: { family: fontFamily, size: 12, weight: "500" }, color: "#AEB6C6", margin: -6 },
        },
      },
      settings: {
        itemSizesReference: "screen",
        zoomToSizeRatioFunction: (r: number) => Math.max(0.6, Math.sqrt(r)),
        labelDensity: compact ? 1.2 : mobile ? 0.45 : 1,
        labelGridCellSize: mobile ? 140 : 130,
        labelRenderedSizeThreshold: compact ? 0 : mobile ? 11 : 7.5,
        minEdgeThickness: 0.7,
        hideEdgesOnMove: data.edges.length > 4000,
        enableNodeDrag: false,
        stagePadding: compact ? 24 : 60,
        minCameraRatio: 0.05,
        maxCameraRatio: 4,
        zoomDuration: reduced ? 0 : 250,
        inertiaDuration: reduced ? 0 : 300,
        gestureTarget: compact ? "shared" : "graph",
        sharedGestureWheelMessage: "Usá Ctrl + rueda para hacer zoom",
        sharedGestureAppleWheelMessage: "Usá ⌘ + rueda para hacer zoom",
        sharedGestureTouchMessage: "Usá dos dedos para mover el grafo",
      },
      nodeReducer: (key, _d, attrs) => {
        const n = m.get(key);
        const st = state.current;
        if (!n || n.type === "space" || !st.visible.has(key)) return { visibility: "hidden", label: null };
        const focus = st.hover ?? st.selected;
        const strong = Boolean(st.hover); // hover ilumina el vecindario; la selección atenúa más suave
        const near = focus ? key === focus || g.areNeighbors(key, focus) : true;
        const base = n.dim ? mixHex(TYPE_COLOR[n.type], "#1B2030", DIM_MIX) : TYPE_COLOR[n.type];
        const big = attrs.coreR >= 6.5;
        const out: Record<string, unknown> = {
          color: base,
          ring: n.type === "contact" ? 1 : 0,
          glow: n.dim ? 0.35 : 1,
          labelColor: n.dim ? "#5D6576" : big ? "#E8EBF2" : "#AEB6C6",
          labelSize: big ? 13.5 : 12,
          labelPosition: "below",
          zIndex: big ? 2 : 1,
        };
        if (focus && !near) {
          out.color = mixHex(base, "#0B0D12", strong ? 0.78 : 0.35);
          out.glow = strong ? 0.15 : 0.6;
          if (strong) out.labelVisibility = "hidden";
          else out.labelColor = "#7C8496";
          out.zIndex = 0;
        } else if (focus) {
          out.depth = "topNodes";
          out.zIndex = key === focus ? 5 : 3;
          if (key === focus) {
            out.labelColor = "#FFFFFF";
            out.labelVisibility = "visible";
          }
        }
        return out;
      },
      edgeReducer: (key, _d, attrs) => {
        const st = state.current;
        const [s, t] = g.extremities(key);
        if (attrs.kind === "space" || !st.visible.has(s) || !st.visible.has(t)) return { visibility: "hidden" };
        const focus = st.hover ?? st.selected;
        const ns = m.get(s);
        const nt = m.get(t);
        const dim = ns?.dim || nt?.dim;
        if (focus && (s === focus || t === focus)) {
          const other = s === focus ? nt : ns;
          return { color: rgba(TYPE_COLOR[other?.type ?? "note"], 0.85), size: 1.6, depth: "topEdges", zIndex: 2 };
        }
        if (focus && st.hover) return { color: "rgba(201,209,224,0.035)", size: 0.6 };
        if (focus) return { color: "rgba(201,209,224,0.08)", size: 0.6 };
        return { color: dim ? "rgba(201,209,224,0.06)" : "rgba(201,209,224,0.13)", size: attrs.kind === "belongs" ? 0.9 : 0.7 };
      },
    });
    sigmaRef.current = sigma;

    // --- Capas 2D ---
    const halos = sigma.createCanvas("halos", { beforeLayer: "stage" });
    const fx = sigma.createCanvas("fx", { afterLayer: "stage" });
    for (const c of [halos, fx]) Object.assign(c.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit2d = (c: HTMLCanvasElement) => {
      const { width, height } = sigma.getDimensions();
      if (c.width !== Math.round(width * dpr) || c.height !== Math.round(height * dpr)) {
        c.width = Math.round(width * dpr);
        c.height = Math.round(height * dpr);
      }
      const ctx = c.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx?.clearRect(0, 0, width, height);
      return ctx;
    };
    const clusterMeta = new Map(data.clusters.map((c) => [c.key, c]));
    const monoFamily = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() || "ui-monospace, monospace";

    // Zona ocupada por la barra superior y la inferior: ahí no se dibujan nombres de constelaciones.
    const insetTop = compact ? 4 : mobile ? 132 : 64;
    const insetBottom = compact ? 4 : mobile ? 100 : 90;
    const drawHalos = () => {
      const ctx = fit2d(halos);
      if (!ctx) return;
      const { width, height } = sigma.getDimensions();
      const groups = new Map<string, { x: number; y: number }[]>();
      g.forEachNode((k, a) => {
        const n = m.get(k);
        if (!n?.cluster || n.type === "space" || !state.current.visible.has(k)) return;
        const p = sigma.graphToViewport({ x: a.x, y: a.y });
        const arr = groups.get(n.cluster) ?? [];
        arr.push(p);
        groups.set(n.cluster, arr);
      });
      const focus = state.current.hover ?? state.current.selected;
      const focusCluster = focus ? m.get(focus)?.cluster : null;
      const labelBoxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
      // Constelaciones grandes primero: su nombre tiene prioridad.
      for (const [key, pts] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
        const c = clusterMeta.get(key);
        if (!c || pts.length < 2) continue;
        let cx = 0;
        let cy = 0;
        for (const p of pts) {
          cx += p.x;
          cy += p.y;
        }
        cx /= pts.length;
        cy /= pts.length;
        let r = 0;
        for (const p of pts) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy));
        r = Math.min(Math.max(r * 1.05 + 46, 70), Math.max(width, height) * 0.6);
        if (cx + r < 0 || cy + r < 0 || cx - r > width || cy - r > height) continue;
        const faded = focus && focusCluster !== key;
        const color = c.done ? "#5D6576" : c.color;
        const alpha = (c.done ? 0.08 : 0.2) * (faded ? 0.35 : 1);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, rgba(color, alpha));
        grad.addColorStop(0.55, rgba(color, alpha * 0.5));
        grad.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        // Nombre de la constelación
        ctx.font = `500 ${compact ? 10 : 11.5}px ${monoFamily}`;
        (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = compact ? "3px" : "4.5px";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = rgba(color, faded ? 0.3 : c.done ? 0.75 : 0.9);
        const text = `${c.label.toUpperCase()}${c.done ? "  ·  TERMINADO" : ""}`;
        const ty = cy - Math.min(r * 0.78, r - 18);
        const tw = ctx.measureText(text).width;
        const box = { x0: cx - tw / 2 - 6, x1: cx + tw / 2 + 6, y0: ty - 10, y1: ty + 10 };
        if (box.y0 < insetTop || box.y1 > height - insetBottom || box.x0 < 4 || box.x1 > width - 4) continue;
        if (labelBoxes.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
        labelBoxes.push(box);
        ctx.fillText(text, cx, ty);
      }
    };

    const pulsing = data.nodes.filter((n) => isPulsing(n, now)).map((n) => n.key);
    let raf = 0;
    const drawFx = (t: number) => {
      const ctx = fit2d(fx);
      if (!ctx) return;
      const { width, height } = sigma.getDimensions();
      const st = state.current;
      for (const k of pulsing) {
        if (!st.visible.has(k)) continue;
        const d = sigma.getNodeDisplayData(k);
        if (!d || d.visibility === "hidden" || !g.hasNode(k)) continue;
        const p = sigma.graphToViewport(g.getNodeAttributes(k));
        if (p.x < -40 || p.y < -40 || p.x > width + 40 || p.y > height + 40) continue;
        const core = sigma.scaleSize(d.size) * CORE;
        const color = TYPE_COLOR[m.get(k)?.type ?? "note"];
        const focus = st.hover ?? st.selected;
        const faded = focus && k !== focus && !g.areNeighbors(k, focus);
        const phase = reduced ? 0.25 : (t / 1800 + hash01(k)) % 1;
        ctx.strokeStyle = rgba(color, (reduced ? 0.45 : 0.6 * (1 - phase)) * (faded ? 0.25 : 1));
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, core * (1.55 + phase * 1.6), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (st.selected && st.visible.has(st.selected)) {
        const d = sigma.getNodeDisplayData(st.selected);
        if (d && g.hasNode(st.selected)) {
          const p = sigma.graphToViewport(g.getNodeAttributes(st.selected));
          const core = sigma.scaleSize(d.size) * CORE;
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 1.3;
          ctx.setLineDash([3, 3.5]);
          ctx.lineDashOffset = reduced ? 0 : -t / 90;
          ctx.beginPath();
          ctx.arc(p.x, p.y, core + 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    };
    const animate = (t: number) => {
      drawFx(t);
      raf = requestAnimationFrame(animate);
    };
    sigma.on("afterRender", () => {
      drawHalos();
      if (reduced || !pulsing.length) drawFx(performance.now());
    });
    if (!reduced) raf = requestAnimationFrame(animate);

    // --- Interacción ---
    sigma.on("enterNode", ({ node }) => {
      state.current.hover = node;
      container.style.cursor = "pointer";
      sigma.refresh({ skipIndexation: true });
    });
    sigma.on("leaveNode", () => {
      state.current.hover = null;
      container.style.cursor = "";
      sigma.refresh({ skipIndexation: true });
    });
    sigma.on("clickNode", ({ node }) => state.current.onSelect(node));
    sigma.on("clickStage", () => state.current.onSelect(null));

    // --- API ---
    const cam = sigma.getCamera();
    const dur = reduced ? 0 : 550;
    const framed = (k: string) => (g.hasNode(k) ? sigma.graphToFramedGraph(g.getNodeAttributes(k)) : null);
    // Desplazamiento de cámara para centrar en el área libre cuando hay un panel a la derecha.
    const shiftFor = (ins: Insets, ratio: number) => {
      const { width, height } = sigma.getDimensions();
      const k = ratio / Math.min(width, height);
      return { dx: ((ins.right ?? 0) / 2) * k, dy: (((ins.bottom ?? 0) - (ins.top ?? 0)) / 2) * k };
    };
    const fit = (keys?: string[], ins: Insets = {}) => {
      const list = (keys ?? [...state.current.visible])
        .filter((k) => m.get(k)?.type !== "space")
        .map(framed)
        .filter((d): d is { x: number; y: number } => Boolean(d));
      if (!list.length) {
        void cam.animate({ x: 0.5, y: 0.5, ratio: 1, angle: 0 }, { duration: dur });
        return;
      }
      const xs = list.map((d) => d.x);
      const ys = list.map((d) => d.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const ratio = Math.min(1.3, Math.max(0.12, Math.max(x1 - x0, y1 - y0) * (ins.right || ins.bottom ? 1.6 : 1.3)));
      const { dx, dy } = shiftFor(ins, ratio);
      void cam.animate({ x: (x0 + x1) / 2 + dx, y: (y0 + y1) / 2 - dy, ratio }, { duration: dur });
    };
    const api: GraphApi = {
      zoomIn: () => void cam.zoomIn({ duration: reduced ? 0 : 250 }),
      zoomOut: () => void cam.zoomOut({ duration: reduced ? 0 : 250 }),
      fit,
      flyTo: (key, ins = {}) => {
        const d = framed(key);
        if (!d) return;
        const ratio = Math.min(cam.getState().ratio, 0.8);
        const { dx, dy } = shiftFor(ins, ratio);
        void cam.animate({ x: d.x + dx, y: d.y - dy, ratio }, { duration: reduced ? 0 : 800 });
      },
    };
    onReady?.(api);

    // --- Layout ForceAtlas2 en Web Worker ---
    let fa2: FA2Layout | null = null;
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    const realCount = data.nodes.filter((n) => n.type !== "space").length;
    if (missing.length && realCount > 1) {
      const fewNew = positions && missing.length < data.nodes.length * 0.3;
      if (fewNew) g.forEachNode((k) => !missing.includes(k) && g.setNodeAttribute(k, "fixed", true));
      const settings = {
        ...inferSettings(g),
        linLogMode: true,
        adjustSizes: false,
        barnesHutOptimize: g.order > 400,
        gravity: 1,
        scalingRatio: 4,
        slowDown: 1 + Math.log(Math.max(1, g.order)),
      };
      fa2 = new FA2Layout(g, { settings, getEdgeWeight: "weight" });
      fa2.start();
      state.current.onLayoutState?.(true);
      const ms = fewNew ? 1500 : Math.min(9000, 2200 + g.order * 4);
      stopTimer = setTimeout(() => {
        fa2?.stop();
        g.forEachNode((k) => g.removeNodeAttribute(k, "fixed"));
        const out: Record<string, [number, number]> = {};
        g.forEachNode((k, a) => {
          out[k] = [Math.round(a.x * 100) / 100, Math.round(a.y * 100) / 100];
        });
        state.current.onLayoutState?.(false);
        state.current.onLayout?.(out);
        fit();
      }, ms);
    }

    const ro = new ResizeObserver(() => sigma.resize());
    ro.observe(container);

    return () => {
      clearTimeout(stopTimer);
      cancelAnimationFrame(raf);
      ro.disconnect();
      fa2?.kill();
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [data]);

  // Filtros, línea de tiempo y selección: solo reevaluar reducers.
  useEffect(() => {
    state.current.visible = visible;
    sigmaRef.current?.refresh();
  }, [visible]);
  useEffect(() => {
    state.current.selected = selected;
    sigmaRef.current?.refresh({ skipIndexation: true });
  }, [selected]);

  return <div ref={host} className={className ?? "absolute inset-0"} data-testid="brain-canvas" />;
}
