"use client";

import { Button, EmptyState } from "@agencyos/ui";
import { TriangleAlert } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      icon={<TriangleAlert />}
      title="Algo salió mal al cargar esta pantalla"
      description="El error quedó registrado. Podés reintentar; si persiste, revisá Configuración → Estado del sistema."
      action={<Button onClick={reset}>Reintentar</Button>}
    />
  );
}
