import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando clientes" className="max-w-6xl">
      <HeaderSkeleton actions={2} tabs={3} />
      <ListSkeleton rows={8} />
    </LoadingShell>
  );
}
