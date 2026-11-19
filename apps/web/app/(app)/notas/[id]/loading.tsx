import { BlockSkeleton, LoadingShell, Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando la nota" className="max-w-7xl">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-[60vh] w-full rounded-[var(--radius-card)]" />
        </div>
        <div className="flex flex-col gap-4">
          <BlockSkeleton rows={4} />
          <BlockSkeleton rows={3} />
        </div>
      </div>
    </LoadingShell>
  );
}
