import { HeaderSkeleton, ListSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando la papelera" className="max-w-3xl">
      <HeaderSkeleton actions={0} tabs={0} />
      <ListSkeleton rows={6} toolbar={false} />
    </LoadingShell>
  );
}
