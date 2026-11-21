import { Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-16 w-72" />
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-3 md:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
