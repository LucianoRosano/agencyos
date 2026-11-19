"use client";

import { Button, Card, EmptyState } from "@agencyos/ui";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";

/**
 * Error de una sección: mantiene la barra lateral y el resto de la app, explica qué pasó y permite reintentar
 * (reset + refresh para volver a pedir los datos al servidor). El código de referencia sirve para buscar en los logs.
 */
export function SectionError({ section, error, reset }: { section: string; error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <Card className="mx-auto mt-4 max-w-xl px-4">
      <EmptyState
        icon={<TriangleAlert />}
        title={`No pudimos cargar ${section}`}
        description={
          <>
            El error quedó registrado. Podés reintentar; si persiste, revisá Configuración → Estado del sistema.
            {error.digest ? <span className="mt-2 block font-mono text-[12px] text-text-faint">Referencia: {error.digest}</span> : null}
          </>
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="primary"
              onClick={() =>
                startTransition(() => {
                  router.refresh();
                  reset();
                })
              }
            >
              Reintentar
            </Button>
            <Button asChild variant="ghost">
              <Link href="/hoy">Ir a Hoy</Link>
            </Button>
          </div>
        }
      />
    </Card>
  );
}
