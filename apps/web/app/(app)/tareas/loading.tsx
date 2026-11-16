import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando tareas" className="max-w-5xl">
      <HeaderSkeleton actions={2} tabs={5} />
      <ListSkeleton rows={10} />
    </LoadingShell>
  );
}
