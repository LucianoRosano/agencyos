import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando presupuestos" className="max-w-none">
      <HeaderSkeleton actions={0} tabs={0} />
      <ListSkeleton rows={4} toolbar={false} />
    </LoadingShell>
  );
}
