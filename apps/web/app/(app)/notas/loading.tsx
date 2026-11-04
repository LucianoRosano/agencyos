import { Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <div role="status" className="mx-auto flex max-w-6xl flex-col gap-4" aria-busy="true" aria-label="Cargando notas">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-56" />
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="hidden flex-col gap-2 md:flex">
          {["a", "b", "c", "d", "e", "f"].map((k) => (
            <Skeleton key={k} className="h-7" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10" />
          {["a", "b", "c", "d", "e", "f"].map((k) => (
            <Skeleton key={k} className="h-16" />
          ))}
        </div>
      </div>
    </div>
  );
}
