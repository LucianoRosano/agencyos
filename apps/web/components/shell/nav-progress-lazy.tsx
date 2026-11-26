"use client";

import { type ComponentType, useEffect, useState } from "react";

/**
 * Extras del marco que se descargan después de hidratar (fuera del JS inicial de cada pantalla):
 * la barra de progreso al navegar y, en la app de la agencia, los avisos en vivo.
 */
export function LazyNavProgress({ live = false }: { live?: boolean }) {
  const [C, setC] = useState<ComponentType[] | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      import("./nav-progress").then((m) => m.NavProgress),
      ...(live ? [import("./live-notifications").then((m) => m.LiveNotifications)] : []),
    ]).then((list) => alive && setC(() => list));
    return () => {
      alive = false;
    };
  }, [live]);
  return C ? (
    <>
      {C.map((X, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lista fija de componentes
        <X key={i} />
      ))}
    </>
  ) : null;
}
