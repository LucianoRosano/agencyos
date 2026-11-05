import { Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <div role="status" className="mx-auto flex max-w-6xl flex-col gap-4" aria-busy="true" aria-label="Cargando el sitio">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Skeleton className="hidden h-72 lg:block" />
        <div className="flex flex-col gap-3">
          {["a", "b", "c"].map((k) => (
            <Skeleton key={k} className="h-28" />
          ))}
        </div>
      </div>
    </div>
  );
}
