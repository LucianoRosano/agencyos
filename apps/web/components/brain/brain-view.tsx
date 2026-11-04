"use client";

import type { BrainLayout } from "@agencyos/modules/brain/types";
import { Button, cn, EmptyState, Sheet, Skeleton } from "@agencyos/ui";
import { Activity, ArrowUpRight, Brain, History, List, Maximize, Minus, Plus, Search, SlidersHorizontal, Waypoints, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { saveLayoutAction } from "@/app/(app)/cerebro/actions";
import type { GraphApi, Insets } from "./graph-canvas";
import { type BrainGraph, type BrainNode, type BrainNodeType, FILTER_TYPES, isPulsing, monthLabel, neighborhood, normText, relTime, TYPE_COLOR, TYPE_LABEL } from "./model";
import "./brain.css";

const GraphCanvas = dynamic(() => import("./graph-canvas"), {
  ssr: false,
  loading: () => (
    <div role="status" className="absolute inset-0 grid place-items-center" aria-busy="true" aria-label="Cargando el grafo">
      <span className="font-mono text-[12px] uppercase tracking-[0.2em] text-text-faint">Cargando el Cerebro…</span>
    </div>
  ),
});

type Props = { graph: BrainGraph; layout: BrainLayout; includeTasks: boolean; initialNode: string | null; initialSpace?: string; viewKey: string };
type View = "graph" | "list";

/** Zonas tapadas por el panel lateral (desktop) o la barra superior y la hoja inferior (celular). */
const panelInset = (): Insets =>
  typeof window === "undefined" ? {} : window.matchMedia("(min-width: 768px)").matches ? { right: 380, top: 60 } : { top: 130, bottom: 300 };

function Dot({ type, dim }: { type: BrainNodeType; dim?: boolean }) {
  const c = TYPE_COLOR[type];
  return type === "contact" ? (
    <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full border-2" style={{ borderColor: c, opacity: dim ? 0.5 : 1 }} />
  ) : (
    <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: c, boxShadow: dim ? "none" : `0 0 8px ${c}`, opacity: dim ? 0.5 : 1 }} />
  );
}

export function BrainView({ graph, layout, includeTasks, initialNode, initialSpace, viewKey }: Props) {
  const router = useRouter();
  const now = graph.generatedAt;
  const real = useMemo(() => graph.nodes.filter((n) => n.type !== "space"), [graph]);
  const byKey = useMemo(() => new Map(graph.nodes.map((n) => [n.key, n])), [graph]);
  const adj = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of graph.edges) {
      if (e.kind === "space") continue;
      m.set(e.s, [...(m.get(e.s) ?? []), e.t]);
      m.set(e.t, [...(m.get(e.t) ?? []), e.s]);
    }
    return m;
  }, [graph]);
  const minTime = useMemo(() => Math.min(now - 30 * 86_400_000, ...real.map((n) => n.createdAt).filter(Boolean)), [real, now]);

  const [types, setTypes] = useState<Set<BrainNodeType>>(() => new Set(FILTER_TYPES.filter((t) => t !== "task" || includeTasks)));
  const [spaceId, setSpaceId] = useState(initialSpace && graph.spaces.some((x) => x.id === initialSpace) ? initialSpace : "");
  const [timeCut, setTimeCut] = useState(now);
  const [view, setView] = useState<View>("graph");
  const [selected, setSelected] = useState<string | null>(initialNode && byKey.has(initialNode) ? initialNode : null);
  const [local, setLocal] = useState<number | null>(null);
  const [laying, setLaying] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const api = useRef<GraphApi | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingFly = useRef<string | null>(initialNode && byKey.has(initialNode) ? initialNode : null);

  useEffect(() => {
    try {
      if (localStorage.getItem("ag-brain-view") === "list") setView("list");
    } catch {}
  }, []);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("ag-brain-view", v);
    } catch {}
  };

  const localSet = useMemo(() => (local && selected ? neighborhood(graph.edges, selected, local) : null), [local, selected, graph.edges]);
  const visible = useMemo(() => {
    const out = new Set<string>();
    for (const n of real) {
      if (!types.has(n.type)) continue;
      if (spaceId && n.spaceId !== spaceId && n.cluster !== `space:${spaceId}`) continue;
      if (n.createdAt > timeCut) continue;
      if (localSet && !localSet.has(n.key)) continue;
      out.add(n.key);
    }
    return out;
  }, [real, types, spaceId, timeCut, localSet]);

  const select = useCallback(
    (key: string | null, fly = false) => {
      setSelected(key);
      if (!key) setLocal(null);
      try {
        const url = new URL(window.location.href);
        if (key) url.searchParams.set("nodo", key);
        else url.searchParams.delete("nodo");
        window.history.replaceState(window.history.state, "", url);
      } catch {}
      if (key && fly) {
        if (api.current) api.current.flyTo(key, panelInset());
        else pendingFly.current = key;
      }
    },
    [],
  );

  // Atajos: "/" busca y vuela, Esc limpia.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && !typing && !document.querySelector("[role=dialog]")) {
        if (local) setLocal(null);
        else select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [local, select]);

  useEffect(() => {
    if (local) {
      const t = setTimeout(() => api.current?.fit([...visible], panelInset()), 60);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [local, visible]);

  const toggleType = (t: BrainNodeType) => {
    if (t === "task") {
      const url = new URL(window.location.href);
      if (includeTasks) url.searchParams.delete("tareas");
      else url.searchParams.set("tareas", "1");
      router.push(`${url.pathname}${url.search}`);
      return;
    }
    setTypes((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const counts = useMemo(() => {
    const c: Partial<Record<BrainNodeType, number>> = {};
    for (const n of real) c[n.type] = (c[n.type] ?? 0) + 1;
    return c;
  }, [real]);
  const sel = selected ? byKey.get(selected) ?? null : null;
  const empty = real.length === 0;
  const onLayout = useCallback(
    (pos: Record<string, [number, number]>) => {
      void saveLayoutAction(viewKey, pos).then((r) => {
        if (!r.ok) toast.error("No se pudo guardar la disposición del grafo");
      });
    },
    [viewKey],
  );

  return (
    <div
      data-theme="dark"
      className="brain-surface relative -mx-4 -mt-5 -mb-28 h-[calc(100dvh-70px)] overflow-hidden md:-mx-8 md:-mt-8 md:-mb-12 md:h-[calc(100dvh-72px)]"
    >
      <h1 className="sr-only">Cerebro</h1>
      {view === "graph" && !empty ? (
        <GraphCanvas
          graph={graph}
          positions={layout?.positions ?? null}
          visible={visible}
          selected={selected}
          onSelect={(k) => select(k)}
          onLayout={onLayout}
          onLayoutState={setLaying}
          onReady={(a) => {
            api.current = a;
            if (pendingFly.current) {
              const k = pendingFly.current;
              pendingFly.current = null;
              setTimeout(() => a.flyTo(k, panelInset()), 150);
            }
          }}
        />
      ) : null}

      {/* Barra superior: buscar y volar · chips · Grafo | Lista */}
      <div className="absolute inset-x-3 top-3 z-20 flex flex-col gap-2 md:inset-x-5 md:top-5 md:flex-row md:items-center md:gap-3">
        <div className="flex items-center gap-2">
          <SearchFly inputRef={searchRef} nodes={real} onPick={(k) => {
            if (view === "list") changeView("graph");
            select(k, true);
          }} />
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label="Filtros y línea de tiempo"
            className="brain-glass grid size-12 shrink-0 place-items-center rounded-[12px] text-text-muted hover:text-text md:hidden"
          >
            <SlidersHorizontal className="size-5" />
          </button>
        </div>
        <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 md:mx-0 md:min-w-0 md:flex-1 md:px-0" role="group" aria-label="Filtrar por tipo">
          {FILTER_TYPES.map((t) => {
            const on = t === "task" ? includeTasks : types.has(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(t)}
                className={cn(
                  "brain-glass flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] transition-opacity md:h-10 md:px-3.5",
                  on ? "text-text" : "border-dashed text-text-faint opacity-70",
                )}
              >
                <Dot type={t} dim={!on} />
                {TYPE_LABEL[t].many}
                {t !== "task" && counts[t] ? <span className="font-mono text-[11px] text-text-faint hidden 2xl:inline">{counts[t]}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="brain-glass hidden h-10 shrink-0 items-center rounded-[10px] p-0.5 md:flex" role="radiogroup" aria-label="Vista">
          {([
            ["graph", "Grafo", <Waypoints key="g" className="size-4" />],
            ["list", "Lista", <List key="l" className="size-4" />],
          ] as const).map(([k, l, icon]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={view === k}
              onClick={() => changeView(k)}
              className={cn("flex h-9 items-center gap-2 rounded-[8px] px-3.5 text-[14px]", view === k ? "bg-white/10 text-text" : "text-text-muted hover:text-text")}
            >
              {icon}
              {l}
            </button>
          ))}
        </div>
      </div>

      {local && sel ? (
        <div className="brain-glass absolute top-[124px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full py-1 pr-1 pl-4 text-[13px] md:top-[76px]">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted">Grafo local</span>
          <span className="max-w-40 truncate text-text">{sel.label}</span>
          <DepthPicker value={local} onChange={setLocal} />
          <button type="button" onClick={() => setLocal(null)} aria-label="Salir del grafo local" className="grid size-8 place-items-center rounded-full text-text-muted hover:bg-white/10 hover:text-text">
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {empty ? (
        <div className="absolute inset-0 z-10 grid place-items-center px-6">
          <div className="brain-glass max-w-md rounded-[16px] p-2">
            <EmptyState
              icon={<Brain />}
              title="El Cerebro todavía está vacío"
              description="Se arma solo con tus datos reales: notas, proyectos, clientes, personas y materias, conectados por [[enlaces]], @menciones y pertenencia."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild variant="primary">
                    <Link href="/notas/nueva">
                      <Plus className="size-4" /> Nueva nota
                    </Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/proyectos/nuevo">Nuevo proyecto</Link>
                  </Button>
                </div>
              }
            />
          </div>
        </div>
      ) : null}

      {view === "list" && !empty ? (
        <BrainList nodes={real.filter((n) => visible.has(n.key))} adj={adj} onShow={(k) => {
          changeView("graph");
          select(k, true);
        }} />
      ) : null}

      {/* Zoom / encuadre */}
      {view === "graph" && !empty ? (
        <div className={cn("brain-glass absolute top-[76px] z-20 hidden flex-col rounded-[12px] md:flex", sel ? "right-[392px]" : "right-5")}>
          <IconBtn label="Acercar" onClick={() => api.current?.zoomIn()}>
            <Plus className="size-4" />
          </IconBtn>
          <IconBtn label="Alejar" onClick={() => api.current?.zoomOut()}>
            <Minus className="size-4" />
          </IconBtn>
          <IconBtn label="Encuadrar todo" onClick={() => api.current?.fit(undefined, sel ? panelInset() : {})}>
            <Maximize className="size-4" />
          </IconBtn>
        </div>
      ) : null}
      {laying ? (
        <p className="brain-glass absolute top-[124px] left-1/2 z-10 -translate-x-1/2 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted md:top-[76px]" aria-live="polite">
          Ordenando el grafo…
        </p>
      ) : null}

      {/* Panel lateral (desktop) */}
      {sel && view === "graph" ? (
        <aside className="brain-glass absolute top-[76px] right-5 bottom-24 z-20 hidden w-[360px] flex-col overflow-hidden rounded-[16px] md:flex" aria-label={`Nodo seleccionado: ${sel.label}`} data-testid="brain-panel">
          <NodePanel node={sel} adj={adj} byKey={byKey} now={now} local={local} onLocal={setLocal} onPick={(k) => select(k, true)} onClose={() => select(null)} />
        </aside>
      ) : null}

      {/* Hoja inferior (celular) */}
      {sel && view === "graph" ? (
        <div className="brain-glass absolute inset-x-3 bottom-[calc(96px+env(safe-area-inset-bottom))] z-20 rounded-[18px] p-4 md:hidden" role="region" data-testid="brain-sheet" aria-label={`Nodo seleccionado: ${sel.label}`}>
          <div className="mx-auto -mt-1.5 mb-3 h-1 w-10 rounded-full bg-white/15" aria-hidden />
          <div className="flex items-center gap-3">
            <Dot type={sel.type} dim={sel.dim} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-semibold text-text">{sel.label}</p>
              <p className="truncate text-[13px] text-text-muted">
                {TYPE_LABEL[sel.type].one}
                {sel.subtitle ? ` · ${sel.subtitle}` : ""} · {(adj.get(sel.key) ?? []).length} conexiones
              </p>
            </div>
            <Button asChild variant="primary" className="h-11 px-4">
              <Link href={sel.href}>Abrir</Link>
            </Button>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" className="h-10 flex-1" aria-pressed={Boolean(local)} onClick={() => setLocal(local ? null : 1)}>
              <Waypoints className="size-4" /> {local ? "Salir del grafo local" : "Grafo local"}
            </Button>
            <Button variant="ghost" size="sm" className="h-10" onClick={() => select(null)} aria-label="Cerrar">
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Línea de tiempo + leyenda (desktop) */}
      {!empty ? (
        <div className="absolute inset-x-5 bottom-5 z-10 hidden items-end gap-3 md:flex">
          <Timeline min={minTime} max={now} value={timeCut} onChange={setTimeCut} />
          <SpaceSelect spaces={graph.spaces} value={spaceId} onChange={setSpaceId} />
          <Legend />
        </div>
      ) : null}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filtros del Cerebro">
        <div className="flex flex-col gap-5">
          <div role="radiogroup" aria-label="Vista" className="flex rounded-[10px] border border-border p-0.5">
            {(["graph", "list"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={view === k}
                onClick={() => {
                  changeView(k);
                  setFiltersOpen(false);
                }}
                className={cn("flex h-11 flex-1 items-center justify-center gap-2 rounded-[8px] text-[15px]", view === k ? "bg-surface-2 text-text" : "text-text-muted")}
              >
                {k === "graph" ? <Waypoints className="size-4" /> : <List className="size-4" />}
                {k === "graph" ? "Grafo" : "Lista"}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] text-text-muted">
            Espacio
            <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className="select-chevron h-11 appearance-none rounded-[var(--radius-control)] border border-border bg-bg-elevated bg-[length:16px] bg-[right_10px_center] bg-no-repeat px-3 text-base text-text">
              <option value="">Todos los espacios</option>
              {graph.spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <Timeline min={minTime} max={now} value={timeCut} onChange={setTimeCut} plain />
          <Legend plain />
        </div>
      </Sheet>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-11 place-items-center text-text-muted hover:text-text [&:not(:last-child)]:border-b [&:not(:last-child)]:border-white/10">
      {children}
    </button>
  );
}

function DepthPicker({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <span className="flex rounded-full border border-white/10 p-0.5" role="radiogroup" aria-label="Profundidad">
      {[1, 2, 3].map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          onClick={() => onChange(d)}
          className={cn("h-7 min-w-7 rounded-full px-2 font-mono text-[12px]", value === d ? "bg-white/15 text-text" : "text-text-muted hover:text-text")}
        >
          {d}
        </button>
      ))}
    </span>
  );
}

function SearchFly({ nodes, onPick, inputRef }: { nodes: BrainNode[]; onPick: (key: string) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => {
    const t = normText(q.trim());
    if (!t) return [];
    const scored: { n: BrainNode; s: number }[] = [];
    for (const n of nodes) {
      const l = normText(n.label);
      const i = l.indexOf(t);
      if (i < 0) continue;
      scored.push({ n, s: (i === 0 ? 0 : 1) + l.length / 200 });
    }
    return scored.sort((a, b) => a.s - b.s).slice(0, 8).map((x) => x.n);
  }, [q, nodes]);
  const pick = (n: BrainNode) => {
    onPick(n.key);
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      const n = results[active];
      if (n) {
        e.preventDefault();
        pick(n);
      }
    } else if (e.key === "Escape") {
      setQ("");
      setOpen(false);
      inputRef.current?.blur();
    }
  };
  return (
    <div className="relative min-w-0 flex-1 md:w-[240px] md:flex-none xl:w-[300px]">
      <div className="brain-glass flex h-12 items-center gap-2.5 rounded-[12px] px-3.5 md:h-11">
        <Search className="size-[18px] shrink-0 text-text-muted" aria-hidden />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          placeholder="Buscar y volar…"
          aria-label="Buscar y volar a un nodo"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="brain-search-results"
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `brain-opt-${active}` : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-text-muted md:text-[15px]"
        />
        <kbd className="hidden rounded-md border border-white/15 px-1.5 font-mono text-[12px] text-text-muted md:inline">/</kbd>
      </div>
      {open && results.length ? (
        <ul id="brain-search-results" role="listbox" aria-label="Resultados" className="brain-glass absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-[12px] p-1">
          {results.map((n, i) => (
            <li
              key={n.key}
              id={`brain-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(n);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 text-[14px]", i === active ? "bg-white/10 text-text" : "text-text-muted")}
            >
              <Dot type={n.type} dim={n.dim} />
              <span className="min-w-0 flex-1 truncate">{n.label}</span>
              <span className="font-mono text-[11px] text-text-faint">{TYPE_LABEL[n.type].one.toLowerCase()}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function NodePanel({
  node,
  adj,
  byKey,
  now,
  local,
  onLocal,
  onPick,
  onClose,
}: {
  node: BrainNode;
  adj: Map<string, string[]>;
  byKey: Map<string, BrainNode>;
  now: number;
  local: number | null;
  onLocal: (d: number | null) => void;
  onPick: (k: string) => void;
  onClose: () => void;
}) {
  const order: BrainNodeType[] = ["client", "project", "contact", "course", "note", "task", "space"];
  const neighbors = (adj.get(node.key) ?? [])
    .map((k) => byKey.get(k))
    .filter((n): n is BrainNode => Boolean(n) && n?.type !== "space")
    .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.label.localeCompare(b.label, "es"));
  const color = TYPE_COLOR[node.type];
  const projects = neighbors.filter((n) => n.type === "project").length;
  const second =
    node.type === "project" && node.progress !== null
      ? { label: "Avance", value: `${node.progress}%`, accent: true }
      : node.type === "client"
        ? { label: "Proyectos", value: String(projects), accent: false }
        : { label: "Actividad", value: relTime(node.activeAt, now), accent: false };
  return (
    <>
      <div className="flex items-start justify-between gap-2 p-5 pb-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.18em]" style={{ color }}>
            <Dot type={node.type} dim={node.dim} />
            {TYPE_LABEL[node.type].one}
            {node.statusLabel ? <span className="text-text-muted">· {node.statusLabel}</span> : null}
          </p>
          <h2 className="mt-2 text-[22px] leading-tight font-semibold text-text">{node.label}</h2>
          <p className="mt-1 text-[13px] text-text-muted">
            {[node.subtitle, `actualizado ${relTime(node.activeAt, now)}`].filter(Boolean).join(" · ")}
            {isPulsing(node, now) ? <span className="ml-2 inline-flex items-center gap-1 text-success"><Activity className="size-3" /> activo</span> : null}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar panel" className="grid size-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-white/10 hover:text-text">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[10px] border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[12px] text-text-muted">Conexiones</p>
            <p className="mt-1 font-mono text-[22px] text-text">{neighbors.length}</p>
          </div>
          <div className="rounded-[10px] border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[12px] text-text-muted">{second.label}</p>
            <p className={cn("mt-1 font-mono text-[22px]", second.accent ? "text-gradient" : "text-text", second.value.length > 8 && "text-[15px] leading-[33px]")}>{second.value}</p>
          </div>
        </div>
        {node.nextAction ? (
          <>
            <p className="mt-5 mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">Siguiente acción</p>
            <p className="rounded-[10px] border border-white/10 bg-white/[0.03] p-3 text-[14px] leading-relaxed text-text">{node.nextAction}</p>
          </>
        ) : null}
        <p className="mt-5 mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">Vecinos directos</p>
        {neighbors.length ? (
          <ul className="flex flex-col pb-3">
            {neighbors.slice(0, 12).map((n) => (
              <li key={n.key}>
                <button type="button" onClick={() => onPick(n.key)} className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-1 text-left text-[14px] text-text hover:bg-white/5">
                  <Dot type={n.type} dim={n.dim} />
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  <span className="font-mono text-[11px] text-text-faint">{TYPE_LABEL[n.type].one.toLowerCase()}</span>
                </button>
              </li>
            ))}
            {neighbors.length > 12 ? <li className="px-1 pt-1 text-[12px] text-text-faint">y {neighbors.length - 12} más</li> : null}
          </ul>
        ) : (
          <p className="pb-3 text-[13px] text-text-faint">Sin conexiones todavía.</p>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-white/10 p-4">
        {local ? (
          <span className="flex flex-1 items-center gap-2">
            <Button variant="secondary" className="h-10" onClick={() => onLocal(null)} aria-pressed>
              <Waypoints className="size-4" /> Grafo local
            </Button>
            <DepthPicker value={local} onChange={onLocal} />
          </span>
        ) : (
          <Button variant="secondary" className="h-10 flex-1" onClick={() => onLocal(1)}>
            <Waypoints className="size-4" /> Grafo local
          </Button>
        )}
        <Button asChild variant="primary" className="h-10 flex-1">
          <Link href={node.href}>
            <ArrowUpRight className="size-4" /> Abrir
          </Link>
        </Button>
      </div>
    </>
  );
}

function Timeline({ min, max, value, onChange, plain }: { min: number; max: number; value: number; onChange: (v: number) => void; plain?: boolean }) {
  const span = Math.max(1, max - min);
  const fill = `${((value - min) / span) * 100}%`;
  const ticks = useMemo(() => {
    const out: { at: number; label: string }[] = [];
    const months = Math.max(1, Math.round(span / (30 * 86_400_000)));
    const n = Math.min(5, months);
    for (let i = 1; i <= n; i++) {
      const at = min + (span * i) / (n + 1);
      out.push({ at: (at - min) / span, label: monthLabel(at, false) });
    }
    return out;
  }, [min, span]);
  const atEnd = value >= max - 86_400_000 / 2;
  return (
    <div className={cn("flex items-center gap-3", plain ? "" : "brain-glass h-14 min-w-0 flex-1 rounded-[12px] px-4 lg:max-w-[560px]")}>
      <History className="size-4 shrink-0 text-text-muted" aria-hidden />
      <span className="w-[70px] shrink-0 font-mono text-[12px] text-text-muted">{monthLabel(min)}</span>
      <div className="relative min-w-0 flex-1">
        <input
          type="range"
          className="brain-range w-full"
          min={min}
          max={max}
          step={86_400_000}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Línea de tiempo: mostrar lo creado hasta"
          aria-valuetext={atEnd ? "Hoy" : monthLabel(value)}
          style={{ ["--fill" as string]: fill }}
        />
        {!plain ? (
          <div className="pointer-events-none absolute inset-x-0 -bottom-2.5 h-3" aria-hidden>
            {ticks.map((t) => (
              <span key={t.at} className="absolute -translate-x-1/2 font-mono text-[10px] text-text-faint" style={{ left: `${t.at * 100}%` }}>
                {t.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <span className="w-[64px] shrink-0 text-right font-mono text-[12px] text-text">{atEnd ? "HOY" : monthLabel(value)}</span>
    </div>
  );
}

function SpaceSelect({ spaces, value, onChange }: { spaces: { id: string; name: string; color: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="brain-glass flex h-14 shrink-0 items-center gap-2 rounded-[12px] pr-1 pl-3.5">
      <span className="sr-only">Espacio</span>
      <span aria-hidden className="size-2.5 rounded-full" style={{ background: spaces.find((s) => s.id === value)?.color ?? "conic-gradient(#22D3EE, #7C5CFF, #FBBF24, #22D3EE)" }} />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="select-chevron h-12 appearance-none bg-transparent bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8 pl-1 text-[14px] text-text outline-none">
        <option value="">Todos los espacios</option>
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Legend({ plain }: { plain?: boolean }) {
  return (
    <div className={cn("flex items-center gap-4 text-[13px]", plain ? "flex-wrap" : "brain-glass h-14 shrink-0 rounded-[12px] px-4")}>
      <span className="flex items-center gap-2 text-text">
        <span className="brain-pulse-icon" aria-hidden /> Pulso <span className="text-text-muted">= actividad reciente (7 días)</span>
      </span>
      <span className="flex items-center gap-2 text-text-muted">
        <span aria-hidden className="inline-block size-2.5 rounded-full bg-[#3a4152]" /> apagado = frenado / terminado
      </span>
    </div>
  );
}

function BrainList({ nodes, adj, onShow }: { nodes: BrainNode[]; adj: Map<string, string[]>; onShow: (k: string) => void }) {
  const groups = useMemo(() => {
    const g = new Map<BrainNodeType, BrainNode[]>();
    for (const n of nodes) g.set(n.type, [...(g.get(n.type) ?? []), n]);
    for (const list of g.values()) list.sort((a, b) => (adj.get(b.key)?.length ?? 0) - (adj.get(a.key)?.length ?? 0) || a.label.localeCompare(b.label, "es"));
    return FILTER_TYPES.filter((t) => g.has(t)).map((t) => ({ type: t, items: g.get(t) ?? [] }));
  }, [nodes, adj]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-row]")];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: navegación con flechas entre filas (roving focus)
    <div className="absolute inset-x-0 top-[124px] bottom-0 z-10 overflow-y-auto px-3 pb-32 md:top-[76px] md:bottom-[92px] md:px-5 md:pb-6" onKeyDown={onKey} data-testid="brain-list">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        {groups.length ? (
          groups.map((g) => (
            <section key={g.type} aria-labelledby={`brain-list-${g.type}`}>
              <h2 id={`brain-list-${g.type}`} className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
                <Dot type={g.type} /> {TYPE_LABEL[g.type].many} <span className="text-text-faint">{g.items.length}</span>
              </h2>
              <ul className="brain-glass overflow-hidden rounded-[12px]">
                {g.items.map((n) => (
                  <li key={n.key} className="flex items-center gap-2 border-b border-white/5 last:border-0">
                    <Link href={n.href} data-row className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-2 hover:bg-white/5 focus-visible:bg-white/5">
                      <Dot type={n.type} dim={n.dim} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-[15px]", n.dim ? "text-text-muted" : "text-text")}>{n.label}</span>
                        <span className="block truncate text-[12px] text-text-faint">
                          {[n.statusLabel, n.subtitle].filter(Boolean).join(" · ") || TYPE_LABEL[n.type].one}
                        </span>
                      </span>
                      <span className="hidden font-mono text-[12px] text-text-muted sm:inline">{adj.get(n.key)?.length ?? 0} conex.</span>
                    </Link>
                    <button type="button" onClick={() => onShow(n.key)} aria-label={`Ver «${n.label}» en el grafo`} className="mr-2 grid size-11 shrink-0 place-items-center rounded-md text-text-muted hover:bg-white/10 hover:text-text">
                      <Waypoints className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <p className="py-16 text-center text-[14px] text-text-muted">Nada coincide con los filtros.</p>
        )}
      </div>
    </div>
  );
}

export function BrainSkeleton() {
  return <Skeleton className="h-[calc(100dvh-160px)] w-full" />;
}
