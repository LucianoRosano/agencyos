"use client";

import dynamic from "next/dynamic";

/** Abonos: el formulario y el menú se cargan solo donde se muestran (pestaña Dinero, Finanzas → Abonos). */
export const LazyNewRetainerButton = dynamic(() => import("./retainer-ui").then((m) => m.NewRetainerButton));
export const LazyRetainerMenu = dynamic(() => import("./retainer-ui").then((m) => m.RetainerMenu));
