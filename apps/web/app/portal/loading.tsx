import { BlockSkeleton, HeaderSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el portal" className="max-w-none">
      <HeaderSkeleton actions={0} tabs={0} />
      <div className="grid gap-3 md:grid-cols-2">
        <BlockSkeleton rows={3} />
        <BlockSkeleton rows={3} />
      </div>
    </LoadingShell>
  );
}
