"use client";

import { useEffect, useRef } from "react";

/** Marcador invisible: al montar, desplaza su contenedor con scroll hasta este punto (p. ej. las 07:00). */
export function ScrollAnchor({ offset }: { offset: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const scroller = ref.current?.closest("[data-scroller]");
    if (scroller) scroller.scrollTop = offset;
  }, [offset]);
  return <span ref={ref} aria-hidden className="hidden" />;
}
