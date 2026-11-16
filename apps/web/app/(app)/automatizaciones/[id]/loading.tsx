import { DetailSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando la automatización" className="max-w-5xl">
      <DetailSkeleton tabs={0} />
    </LoadingShell>
  );
}
