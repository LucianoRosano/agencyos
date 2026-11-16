import { BlockSkeleton, HeaderSkeleton, LoadingShell, StatsSkeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando Negocio" className="max-w-[1400px]">
      <HeaderSkeleton actions={0} tabs={3} />
      <StatsSkeleton count={8} />
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <BlockSkeleton rows={5} />
        <BlockSkeleton rows={5} />
      </div>
    </LoadingShell>
  );
}
