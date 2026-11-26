"use client";

import dynamic from "next/dynamic";

/** Tablero y hoja de tarea nueva cargados aparte: la ficha de proyecto no los necesita para mostrarse (< 170 KB). */
export const LazyTaskBoard = dynamic(() => import("./task-board").then((m) => m.TaskBoard), {
  loading: () => <div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />,
});
export const LazyNewTaskSheet = dynamic(() => import("./task-form").then((m) => m.NewTaskSheet));
