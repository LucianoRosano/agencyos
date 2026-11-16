import { BlockSkeleton, HeaderSkeleton, LoadingShell, Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el presupuesto" className="max-w-none">
      <Skeleton className="mb-4 h-3.5 w-32" />
      <HeaderSkeleton actions={2} tabs={0} />
      <BlockSkeleton rows={8} />
    </LoadingShell>
  );
}
