import { CardGridSkeleton, HeaderSkeleton, LoadingShell, StatsSkeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando Facultad" className="max-w-6xl">
      <HeaderSkeleton actions={1} tabs={0} />
      <StatsSkeleton count={4} />
      <div className="mt-5">
        <CardGridSkeleton count={3} cols={3} />
      </div>
    </LoadingShell>
  );
}
