import { HeaderSkeleton, ListSkeleton, LoadingShell, StatsSkeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando activos técnicos" className="max-w-6xl">
      <HeaderSkeleton actions={1} tabs={6} />
      <StatsSkeleton count={4} />
      <div className="mt-5">
        <ListSkeleton rows={6} toolbar={false} />
      </div>
    </LoadingShell>
  );
}
