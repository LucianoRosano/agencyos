import { BlockSkeleton, LoadingShell, Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el modo foco" className="max-w-2xl">
      <Skeleton className="mx-auto mb-6 h-3 w-32" />
      <Skeleton className="mx-auto mb-8 h-9 w-72" />
      <BlockSkeleton rows={3} />
    </LoadingShell>
  );
}
