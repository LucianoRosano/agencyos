"use client";

import { type ComponentType, useEffect, useState } from "react";

/** La barra de progreso se descarga después de hidratar (fuera del JS inicial de cada pantalla). */
export function LazyNavProgress() {
  const [C, setC] = useState<ComponentType | null>(null);
  useEffect(() => {
    let alive = true;
    void import("./nav-progress").then((m) => alive && setC(() => m.NavProgress));
    return () => {
      alive = false;
    };
  }, []);
  return C ? <C /> : null;
}
