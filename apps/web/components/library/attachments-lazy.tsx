"use client";

import { Skeleton } from "@agencyos/ui";
import dynamic from "next/dynamic";

/** Adjuntos diferidos: el uploader y el selector de la Biblioteca llegan después de pintar (fuera del JS inicial). */
export const LazyAttachments = dynamic(() => import("./attachments").then((m) => m.Attachments), {
  ssr: false,
  loading: () => <Skeleton className="h-20 w-full" />,
});
