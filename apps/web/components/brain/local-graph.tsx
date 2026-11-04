"use client";

import { cn, Skeleton } from "@agencyos/ui";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { localGraphAction } from "@/app/(app)/cerebro/actions";
import type { BrainGraph } from "./model";
import "./brain.css";

const GraphCanvas = dynamic(() => import("./graph-canvas"), { ssr: false, loading: () => <Skeleton className="absolute inset-0 rounded-none" /> });

type Data = { graph: BrainGraph & { center: string }; positions: Record<string, [number, number]> | null };

/**
 * Grafo local embebible (profundidad 1–3) para fichas de nota, proyecto, cliente o materia.
 * Carga diferida: el bundle del grafo y los datos se piden cuando el bloque entra en pantalla.
 */
export function LocalGraph({ entityType, entityId, depth = 1, className }: { entityType: string; entityId: string; depth?: number; className?: string }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [d, setD] = useState(Math.max(1, Math.min(3, depth)));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!shown) return;
    let alive = true;
    setError(false);
    localGraphAction(entityType, entityId, d)
      .then((r) => alive && setData(r))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [shown, entityType, entityId, d]);

  const visible = useMemo(() => new Set(data?.graph.nodes.map((n) => n.key) ?? []), [data]);
  const real = data?.graph.nodes.filter((n) => n.type !== "space").length ?? 0;

  return (
    <div ref={box} data-theme="dark" className={cn("brain-surface relative min-h-48 w-full overflow-hidden", className)} role="region" aria-label="Grafo local">
      <div className="absolute top-2 right-2 z-10 flex rounded-md border border-border bg-bg/80 p-0.5 backdrop-blur" role="radiogroup" aria-label="Profundidad">
        {[1, 2, 3].map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={d === k}
            onClick={() => setD(k)}
            className={cn("h-8 min-w-8 rounded px-2 font-mono text-[12px]", d === k ? "bg-surface-2 text-text" : "text-text-muted hover:text-text")}
          >
            {k}
          </button>
        ))}
      </div>
      {error ? (
        <p className="absolute inset-0 grid place-items-center p-4 text-center text-[13px] text-text-muted">No se pudo cargar el grafo.</p>
      ) : !data ? (
        <Skeleton className="absolute inset-0 rounded-none" />
      ) : real <= 1 ? (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-[13px] text-text-muted">
          Sin conexiones todavía. Enlazá con [[Nota]], @cliente o #proyecto.
        </p>
      ) : (
        <GraphCanvas
          graph={data.graph}
          positions={data.positions}
          visible={visible}
          selected={data.graph.center}
          compact
          onSelect={(key) => {
            const n = key ? data.graph.nodes.find((x) => x.key === key) : null;
            if (n && n.key !== data.graph.center) router.push(n.href);
          }}
        />
      )}
    </div>
  );
}
