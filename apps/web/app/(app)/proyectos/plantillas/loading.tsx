import { CardGridSkeleton, HeaderSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando plantillas" className="max-w-5xl">
      <HeaderSkeleton actions={1} tabs={0} />
      <CardGridSkeleton count={4} cols={2} />
    </LoadingShell>
  );
}
