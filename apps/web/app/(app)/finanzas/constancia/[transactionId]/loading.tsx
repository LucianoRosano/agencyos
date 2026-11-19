import { BlockSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando la constancia" className="max-w-xl">
      <BlockSkeleton rows={8} />
    </LoadingShell>
  );
}
