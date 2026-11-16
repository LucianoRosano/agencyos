import { HeaderSkeleton, ListSkeleton, LoadingShell, Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando la bandeja" className="max-w-3xl">
      <HeaderSkeleton actions={1} tabs={0} />
      <Skeleton className="mb-5 h-12 w-full" />
      <ListSkeleton rows={6} toolbar={false} />
    </LoadingShell>
  );
}
