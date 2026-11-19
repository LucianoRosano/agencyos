import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando webhooks" className="max-w-4xl">
      <HeaderSkeleton actions={1} tabs={0} />
      <ListSkeleton rows={4} toolbar={false} />
    </LoadingShell>
  );
}
