import { BlockSkeleton, HeaderSkeleton, LoadingShell, StatsSkeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando reportes" className="max-w-6xl">
      <HeaderSkeleton actions={2} tabs={7} />
      <StatsSkeleton count={4} />
      <div className="mt-5">
        <BlockSkeleton rows={8} />
      </div>
    </LoadingShell>
  );
}
