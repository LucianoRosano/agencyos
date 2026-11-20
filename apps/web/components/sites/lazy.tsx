"use client";

/**
 * Componentes de las pestañas del sitio cargados por pestaña: la ficha importa este módulo chico y cada pestaña
 * descarga solo lo suyo (antes, el editor de estructura, el briefing, el checklist y las revisiones entraban
 * todos en el JS inicial de cualquier pestaña). Se renderizan en el servidor igual que antes.
 */
import dynamic from "next/dynamic";

export const BlueprintEditor = dynamic(() => import("./blueprint-editor").then((m) => m.BlueprintEditor), {
  loading: () => <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />,
});
export const TemplatePicker = dynamic(() => import("./blueprint-actions").then((m) => m.TemplatePicker));
export const RestoreVersionButton = dynamic(() => import("./blueprint-actions").then((m) => m.RestoreVersionButton));
export const BriefForm = dynamic(() => import("./brief-ui").then((m) => m.BriefForm), {
  loading: () => <div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />,
});
export const QuestionsPanel = dynamic(() => import("./brief-ui").then((m) => m.QuestionsPanel));
export const SlotEditSheet = dynamic(() => import("./content-ui").then((m) => m.SlotEditSheet));
export const SlotStatusSelect = dynamic(() => import("./content-ui").then((m) => m.SlotStatusSelect));
export const DeleteEnvironmentButton = dynamic(() => import("./env-ui").then((m) => m.DeleteEnvironmentButton));
export const EnvironmentSheet = dynamic(() => import("./env-ui").then((m) => m.EnvironmentSheet));
export const EnsureDocsButton = dynamic(() => import("./launch-ui").then((m) => m.EnsureDocsButton));
export const LaunchEditSheet = dynamic(() => import("./launch-ui").then((m) => m.LaunchEditSheet));
export const LaunchStatusToggle = dynamic(() => import("./launch-ui").then((m) => m.LaunchStatusToggle));
export const NewLaunchCheckSheet = dynamic(() => import("./launch-ui").then((m) => m.NewLaunchCheckSheet));
export const NewRequirementSheet = dynamic(() => import("./requirements-ui").then((m) => m.NewRequirementSheet));
export const RequirementList = dynamic(() => import("./requirements-ui").then((m) => m.RequirementList));
export const CloseRoundButton = dynamic(() => import("./revisions-ui").then((m) => m.CloseRoundButton));
export const EditItemSheet = dynamic(() => import("./revisions-ui").then((m) => m.EditItemSheet));
export const ItemStatusSelect = dynamic(() => import("./revisions-ui").then((m) => m.ItemStatusSelect));
export const NewItemSheet = dynamic(() => import("./revisions-ui").then((m) => m.NewItemSheet));
export const OpenRoundButton = dynamic(() => import("./revisions-ui").then((m) => m.OpenRoundButton));
