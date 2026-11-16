import { BlockSkeleton, HeaderSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando aprobaciones" className="max-w-3xl">
      <HeaderSkeleton actions={0} tabs={0} />
      <div className="flex flex-col gap-4">
        <BlockSkeleton rows={4} />
        <BlockSkeleton rows={4} />
      </div>
    </LoadingShell>
  );
}
