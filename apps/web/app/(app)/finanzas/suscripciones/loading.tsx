import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando suscripciones" className="max-w-6xl">
      <HeaderSkeleton actions={2} tabs={7} />
      <ListSkeleton rows={6} toolbar={false} />
    </LoadingShell>
  );
}
