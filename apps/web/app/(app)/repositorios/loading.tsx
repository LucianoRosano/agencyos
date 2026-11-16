import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando repositorios" className="max-w-6xl">
      <HeaderSkeleton actions={2} tabs={2} />
      <ListSkeleton rows={8} />
    </LoadingShell>
  );
}
