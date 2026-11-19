import { DetailSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el cliente" className="max-w-6xl">
      <DetailSkeleton tabs={6} />
    </LoadingShell>
  );
}
