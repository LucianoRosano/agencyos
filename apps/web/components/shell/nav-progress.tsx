"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * Barra fina arriba de todo mientras carga la pantalla siguiente: aparece recién a los 120 ms (las navegaciones
 * instantáneas no la muestran), avanza despacio y se completa al llegar. Sin dependencias; con
 * prefers-reduced-motion no se muestra (globals.css).
 */
function Bar() {
  const path = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const href = `${path}?${search.toString()}`;
  const first = useRef(true);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // mismo lugar o solo #ancla
      if (/\.(pdf|csv|zip|ics|xlsx)$/i.test(url.pathname) || /\/(pdf|exportar|comprobante|remito|informe)(\/|$)/.test(url.pathname)) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("loading"), 120);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: se completa cada vez que cambia la URL
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setState((s) => (s === "loading" ? "done" : "idle"));
    const t = setTimeout(() => setState("idle"), 500);
    return () => clearTimeout(t);
  }, [href]);

  // Por si la navegación se cancela (redirección al mismo lugar, error): no queda colgada.
  useEffect(() => {
    if (state !== "loading") return;
    const t = setTimeout(() => setState("idle"), 12_000);
    return () => clearTimeout(t);
  }, [state]);

  if (state === "idle") return null;
  return <div className="ag-progress" data-state={state} aria-hidden />;
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
