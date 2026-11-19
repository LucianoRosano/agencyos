import { CardGridSkeleton, HeaderSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando IA" className="max-w-6xl">
      <HeaderSkeleton actions={1} tabs={3} />
      <CardGridSkeleton count={6} cols={3} />
    </LoadingShell>
  );
}
