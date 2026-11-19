"use client";

import { usePathname } from "next/navigation";
import { ViewTransition } from "react";

/**
 * Transición entre pantallas con View Transitions de React 19 (la navegación de Next ya es una transición).
 * Solo el contenido hace un fundido corto; barra lateral y topbar quedan quietos. Sin soporte del navegador o con
 * prefers-reduced-motion, el cambio es instantáneo (globals.css).
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <ViewTransition key={path} enter="ag-page-enter" exit="ag-page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
