"use client";

import { useEffect } from "react";

/**
 * Mantiene al día la copia para usar sin conexión. El motor se descarga cuando el navegador está ocioso
 * (fuera del JS inicial). Si cambió el usuario o el espacio de trabajo, la copia anterior se borra.
 */
export function OfflineSync({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  useEffect(() => {
    if (typeof indexedDB === "undefined") return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2500));
    const id = idle(async () => {
      const eng = await import("@/lib/offline/engine");
      if (cancelled || !eng.offlineEnabled()) return;
      const meta = await eng.getMeta();
      if ((meta.userId && meta.userId !== userId) || (meta.workspaceId && meta.workspaceId !== workspaceId)) await eng.wipe();
      stop = eng.startAutoSync();
      // La pantalla sin conexión se actualiza en el service worker con cada versión nueva de la app.
      navigator.serviceWorker?.controller?.postMessage({ type: "refresh-local" });
    });
    return () => {
      cancelled = true;
      (window.cancelIdleCallback ?? window.clearTimeout)(id as number);
      stop?.();
    };
  }, [userId, workspaceId]);
  return null;
}
