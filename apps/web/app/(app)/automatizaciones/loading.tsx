import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando automatizaciones" className="max-w-6xl">
      <HeaderSkeleton actions={2} tabs={2} />
      <ListSkeleton rows={6} toolbar={false} />
    </LoadingShell>
  );
}
