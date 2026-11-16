import { BlockSkeleton, HeaderSkeleton, LoadingShell, StatsSkeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando Finanzas" className="max-w-6xl">
      <HeaderSkeleton actions={2} tabs={7} />
      <StatsSkeleton count={4} />
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <BlockSkeleton rows={5} />
        <BlockSkeleton rows={5} />
      </div>
    </LoadingShell>
  );
}
