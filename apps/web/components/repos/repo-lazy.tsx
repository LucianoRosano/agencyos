"use client";

import dynamic from "next/dynamic";

/** «Crear repositorio» se carga solo en la pestaña Repositorios del proyecto (no en todas las pestañas de la ficha). */
export const LazyCreateRepoSheet = dynamic(() => import("./repo-ui").then((m) => m.CreateRepoSheet));
