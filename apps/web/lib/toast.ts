"use client";

import type { ExternalToast } from "sonner";

/**
 * `toast` liviano: misma API que sonner para lo que usa la app (success / error), pero sonner (≈ 10 KB gzip) se
 * descarga después de hidratar (components/toaster.tsx) y no suma al JS inicial de cada ruta. Los toasts pedidos antes
 * de que el Toaster esté montado esperan a que lo esté (no se pierden).
 */
type Sonner = typeof import("sonner");
type Message = Parameters<Sonner["toast"]["success"]>[0];

let resolveReady: (m: Sonner) => void = () => undefined;
const ready = new Promise<Sonner>((r) => {
  resolveReady = r;
});

/** Lo llama el Toaster cuando ya está montado y escuchando. */
export function markToasterReady(m: Sonner) {
  resolveReady(m);
}

export const toast = {
  success(message: Message, data?: ExternalToast) {
    void ready.then((m) => m.toast.success(message, data));
  },
  error(message: Message, data?: ExternalToast) {
    void ready.then((m) => m.toast.error(message, data));
  },
  /** Aviso neutro (sin tilde ni cruz): avisos que llegan con la app abierta. */
  info(message: Message, data?: ExternalToast) {
    void ready.then((m) => m.toast(message, data));
  },
};
