"use client";

import dynamic from "next/dynamic";

/**
 * Partes de la ficha de presupuesto que solo se usan en una pestaña o al tocarlas: el editor (pestaña «Editar»),
 * la hoja del enlace público y las hojas de enviar/aceptar/rechazar. Así la ficha queda < 170 KB de JS inicial.
 */
export const LazyQuoteEditor = dynamic(() => import("./quote-editor").then((m) => m.QuoteEditor), {
  loading: () => <div className="h-[70dvh] animate-pulse rounded-[var(--radius-card)] bg-surface-2" />,
});
export const LazyPublicLinkSheet = dynamic(() => import("./public-link").then((m) => m.PublicLinkSheet));
export const LazySendSheet = dynamic(() => import("./quote-actions").then((m) => m.SendSheet));
export const LazyAcceptSheet = dynamic(() => import("./quote-actions").then((m) => m.AcceptSheet));
export const LazyRejectSheet = dynamic(() => import("./quote-actions").then((m) => m.RejectSheet));
