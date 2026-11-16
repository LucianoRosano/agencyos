import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando notificaciones" className="max-w-3xl">
      <HeaderSkeleton actions={1} tabs={0} />
      <ListSkeleton rows={8} toolbar={false} />
    </LoadingShell>
  );
}
