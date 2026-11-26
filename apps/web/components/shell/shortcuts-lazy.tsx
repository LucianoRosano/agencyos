"use client";

import { type ComponentProps, type ComponentType, useEffect, useState } from "react";
import type { Shortcuts } from "./shortcuts";

type Props = ComponentProps<typeof Shortcuts>;

/** Atajos de teclado (G + letra, ?) descargados apenas hidrata la página, fuera del JS inicial de cada pantalla. */
export function LazyShortcuts(props: Props) {
  const [C, setC] = useState<ComponentType<Props> | null>(null);
  useEffect(() => {
    let alive = true;
    void import("./shortcuts").then((m) => alive && setC(() => m.Shortcuts));
    return () => {
      alive = false;
    };
  }, []);
  return C ? <C {...props} /> : null;
}
