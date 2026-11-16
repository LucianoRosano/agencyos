import { BlockSkeleton, HeaderSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando la marca" className="max-w-4xl">
      <HeaderSkeleton actions={1} tabs={0} />
      <div className="flex flex-col gap-4">
        <BlockSkeleton rows={4} />
        <BlockSkeleton rows={4} />
      </div>
    </LoadingShell>
  );
}
