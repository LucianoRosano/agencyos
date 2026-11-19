import { DetailSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el producto" className="max-w-6xl">
      <DetailSkeleton tabs={4} />
    </LoadingShell>
  );
}
