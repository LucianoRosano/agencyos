import { CardGridSkeleton, HeaderSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando cuentas" className="max-w-6xl">
      <HeaderSkeleton actions={2} tabs={7} />
      <CardGridSkeleton count={6} cols={3} />
    </LoadingShell>
  );
}
