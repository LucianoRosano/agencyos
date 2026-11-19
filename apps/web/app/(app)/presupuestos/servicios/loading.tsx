import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando servicios" className="max-w-6xl">
      <HeaderSkeleton actions={1} tabs={2} />
      <ListSkeleton rows={8} />
    </LoadingShell>
  );
}
