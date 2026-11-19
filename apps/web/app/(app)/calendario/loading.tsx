import { HeaderSkeleton, LoadingShell, Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el calendario" className="max-w-7xl">
      <HeaderSkeleton actions={2} tabs={0} />
      <Skeleton className="mb-5 h-11 w-full md:w-96" />
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-border">
        {Array.from({ length: 35 }, (_, i) => `d${i}`).map((k) => (
          <div key={k} className="flex h-16 flex-col gap-1.5 bg-surface p-1.5 md:h-28 md:p-2">
            <Skeleton className="h-3 w-5" />
          </div>
        ))}
      </div>
    </LoadingShell>
  );
}
