import { Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <div role="status" className="mx-auto flex max-w-6xl flex-col gap-4" aria-busy="true" aria-label="Cargando la biblioteca">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-10" />
      <Skeleton className="h-24" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((k) => (
          <Skeleton key={k} className="aspect-[4/5]" />
        ))}
      </div>
    </div>
  );
}
