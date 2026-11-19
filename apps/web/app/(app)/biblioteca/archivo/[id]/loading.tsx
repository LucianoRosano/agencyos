import { DetailSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el archivo" className="max-w-6xl">
      <DetailSkeleton tabs={0} />
    </LoadingShell>
  );
}
