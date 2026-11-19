"use client";

import { Skeleton } from "@agencyos/ui";
import dynamic from "next/dynamic";

/**
 * Versiones diferidas de los editores de colaboración (etiquetas, conexiones, comentarios): se descargan después de
 * pintar la ficha, fuera del JS inicial (presupuesto < 170 KB por ruta). Mientras cargan se ve un esqueleto.
 */
const box = (h: string) => () => <Skeleton className={`w-full ${h}`} />;

export const LazyTagEditor = dynamic(() => import("./collab-ui").then((m) => m.TagEditor), { ssr: false, loading: box("h-8") });
export const LazyConnectionsEditor = dynamic(() => import("./collab-ui").then((m) => m.ConnectionsEditor), { ssr: false, loading: box("h-16") });
export const LazyCommentThread = dynamic(() => import("./collab-ui").then((m) => m.CommentThread), { ssr: false, loading: box("h-28") });
