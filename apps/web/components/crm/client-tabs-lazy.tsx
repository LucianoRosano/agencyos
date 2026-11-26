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
// Hojas y tarjetas que solo se usan al tocarlas o en una pestaña puntual (mantienen la ficha < 170 KB).
export const LazyFiscalCard = dynamic(() => import("./fiscal-card").then((m) => m.FiscalCard));
export const LazyEditClientSheet = dynamic(() => import("./client-form").then((m) => m.EditClientSheet));
export const LazyNewContactSheet = dynamic(() => import("./contact-forms").then((m) => m.NewContactSheet));
export const LazyNewOpportunitySheet = dynamic(() => import("./opportunity-form").then((m) => m.NewOpportunitySheet));
export const LazyInteractionSheet = dynamic(() => import("./interaction-form").then((m) => m.InteractionSheet));
