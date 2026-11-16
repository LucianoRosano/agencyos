import { BlockSkeleton, HeaderSkeleton, LoadingShell, Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el proyecto" className="max-w-none">
      <Skeleton className="mb-4 h-3.5 w-32" />
      <HeaderSkeleton actions={0} tabs={0} />
      <div className="flex flex-col gap-4">
        <BlockSkeleton rows={4} />
        <BlockSkeleton rows={5} />
      </div>
    </LoadingShell>
  );
}
