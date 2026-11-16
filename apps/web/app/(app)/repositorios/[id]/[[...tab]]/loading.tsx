import { DetailSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el repositorio" className="max-w-6xl">
      <DetailSkeleton tabs={5} />
    </LoadingShell>
  );
}
