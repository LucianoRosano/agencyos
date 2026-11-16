import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando lo por pagar" className="max-w-5xl">
      <HeaderSkeleton actions={2} tabs={7} />
      <ListSkeleton rows={6} toolbar={false} />
    </LoadingShell>
  );
}
