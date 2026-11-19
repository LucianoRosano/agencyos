import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando movimientos" className="max-w-6xl">
      <HeaderSkeleton actions={2} tabs={7} />
      <ListSkeleton rows={10} />
    </LoadingShell>
  );
}
