import { CardGridSkeleton, HeaderSkeleton, LoadingShell, Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando proyectos" className="max-w-6xl">
      <HeaderSkeleton actions={2} tabs={7} />
      <Skeleton className="mb-5 h-10 w-full md:max-w-sm" />
      <CardGridSkeleton count={6} cols={3} />
    </LoadingShell>
  );
}
