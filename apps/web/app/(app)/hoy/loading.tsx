import { BlockSkeleton, LoadingShell, Skeleton } from "@agencyos/ui";

/** Esqueleto de Hoy: misma grilla que la página (encabezado con saludo y chips, bloques 3 × n, proyectos a lo ancho). */
export default function Loading() {
  return (
    <LoadingShell label="Cargando Hoy" className="max-w-[1560px]">
      <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-9 w-64 md:h-11 md:w-96" />
          <div className="mt-1 flex flex-wrap gap-2">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <BlockSkeleton rows={3} className="min-h-72" />
        <BlockSkeleton rows={4} className="min-h-72" />
        <BlockSkeleton rows={5} className="min-h-72" />
        <BlockSkeleton rows={3} className="min-h-56" />
        <BlockSkeleton rows={3} className="min-h-56" />
        <BlockSkeleton rows={3} className="min-h-56" />
        <BlockSkeleton rows={2} className="lg:col-span-2 xl:col-span-3" />
      </div>
    </LoadingShell>
  );
}
