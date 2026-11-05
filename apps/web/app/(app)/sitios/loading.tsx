import { Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <div role="status" className="mx-auto flex max-w-6xl flex-col gap-4" aria-busy="true" aria-label="Cargando sitios">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {["a", "b", "c"].map((k) => (
          <Skeleton key={k} className="h-44" />
        ))}
      </div>
    </div>
  );
}
