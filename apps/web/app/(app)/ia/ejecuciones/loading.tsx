import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando ejecuciones" className="max-w-6xl">
      <HeaderSkeleton actions={0} tabs={3} />
      <ListSkeleton rows={8} toolbar={false} />
    </LoadingShell>
  );
}
