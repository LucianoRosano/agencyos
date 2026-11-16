import { CardGridSkeleton, HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el espacio" className="max-w-6xl">
      <HeaderSkeleton actions={0} tabs={0} />
      <CardGridSkeleton count={3} cols={3} />
      <div className="mt-6">
        <ListSkeleton rows={5} toolbar={false} />
      </div>
    </LoadingShell>
  );
}
