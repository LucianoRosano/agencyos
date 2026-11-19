import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando espacios" className="max-w-3xl">
      <HeaderSkeleton actions={1} tabs={0} />
      <ListSkeleton rows={4} toolbar={false} />
    </LoadingShell>
  );
}
