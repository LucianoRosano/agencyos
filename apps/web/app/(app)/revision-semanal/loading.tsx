import { BlockSkeleton, HeaderSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando la revisión semanal" className="max-w-3xl">
      <HeaderSkeleton actions={1} tabs={0} />
      <div className="flex flex-col gap-4">
        <BlockSkeleton rows={4} />
        <BlockSkeleton rows={4} />
        <BlockSkeleton rows={3} />
      </div>
    </LoadingShell>
  );
}
