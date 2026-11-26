"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "@/lib/toast";

type State = { unread: number; latest: { id: string; title: string; body: string | null; priority: string; href: string } | null };

/**
 * Avisos en vivo con la app abierta: cada 45 s (solo con la pestaña visible) y al volver a la pestaña consulta
 * cuántos hay sin leer; actualiza la campana y el ícono de la app, y si llegó uno nuevo lo muestra abajo con «Ver».
 */
export function LiveNotifications() {
  const router = useRouter();
  useEffect(() => {
    let last: string | null = null;
    let first = true;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const r = await fetch("/api/notificaciones/estado", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as State;
        window.dispatchEvent(new CustomEvent("ag:unread", { detail: d.unread }));
        const id = d.latest?.id ?? null;
        if (!first && id && id !== last && d.latest) {
          const n = d.latest;
          toast.info(n.priority === "urgent" ? `⚠ ${n.title}` : n.title, {
            description: n.body ?? undefined,
            duration: n.priority === "urgent" ? 12_000 : 6_000,
            action: { label: "Ver", onClick: () => router.push(n.href) },
          });
        }
        last = id;
        first = false;
      } catch {
        // sin conexión: se reintenta en la próxima vuelta
      } finally {
        busy = false;
      }
    };
    void check();
    const timer = window.setInterval(check, 45_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router]);
  return null;
}
