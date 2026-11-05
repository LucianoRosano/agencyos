import { Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4" role="status" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-10 w-full" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </div>
  );
}
