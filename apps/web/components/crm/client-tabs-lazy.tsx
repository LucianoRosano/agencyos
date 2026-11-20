"use client";

import dynamic from "next/dynamic";

/**
 * Componentes de pestañas puntuales de la ficha de cliente, cargados solo cuando la pestaña los muestra
 * (si se importan directo, viajan en el JS de todas las pestañas y la ficha pasa los 170 KB).
 */
export const LazyWhatsappImportSheet = dynamic(() => import("./whatsapp-import").then((m) => m.WhatsappImportSheet));
export const LazyPipelineView = dynamic(() => import("./pipeline").then((m) => m.PipelineView));
export const LazyLinkContactSheet = dynamic(() => import("./contact-forms").then((m) => m.LinkContactSheet));
export const LazyClientContactMenu = dynamic(() => import("./contact-forms").then((m) => m.ClientContactMenu));
export const LazyInteractionForm = dynamic(() => import("./interaction-form").then((m) => m.InteractionForm));
