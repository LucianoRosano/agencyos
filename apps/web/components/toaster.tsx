"use client";

import { type ComponentType, useEffect, useRef, useState } from "react";
import type { ToasterProps } from "sonner";
import { markToasterReady } from "@/lib/toast";

/**
 * Toasts (docs/07 §3): abajo al centro en desktop (no tapan los botones «Guardar», que van a la derecha) y arriba en el
 * celular, para no tapar la barra inferior ni el botón de captura. sonner se carga apenas hidrata la página, fuera del JS inicial (ver lib/toast.ts).
 */
export function Toaster({ theme }: { theme: "dark" | "light" }) {
  const [Sonner, setSonner] = useState<ComponentType<ToasterProps> | null>(null);
  const [mobile, setMobile] = useState(false);
  const mod = useRef<typeof import("sonner") | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    let alive = true;
    void import("sonner").then((m) => {
      if (!alive) return;
      mod.current = m;
      setSonner(() => m.Toaster);
    });
    return () => {
      alive = false;
      mq.removeEventListener("change", on);
    };
  }, []);
  // Los efectos del hijo (la suscripción de sonner) corren antes que este: recién ahí se liberan los toasts pendientes.
  useEffect(() => {
    if (Sonner && mod.current) markToasterReady(mod.current);
  }, [Sonner]);
  if (!Sonner) return null;
  return (
    <Sonner
      theme={theme}
      position={mobile ? "top-center" : "bottom-center"}
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      toastOptions={{ className: "!bg-surface !text-text !border-border !shadow-[var(--shadow-pop)]", style: { fontFamily: "var(--font-sans)" } }}
    />
  );
}
