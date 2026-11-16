import { BlockSkeleton, HeaderSkeleton, LoadingShell, Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el presupuesto" className="max-w-7xl">
      <Skeleton className="mb-4 h-3.5 w-32" />
      <HeaderSkeleton actions={2} tabs={4} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <BlockSkeleton rows={6} />
          <BlockSkeleton rows={4} />
        </div>
        <div className="flex flex-col gap-4">
          <BlockSkeleton rows={5} />
          <BlockSkeleton rows={3} />
        </div>
      </div>
    </LoadingShell>
  );
}
