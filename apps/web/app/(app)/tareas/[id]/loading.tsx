import { BlockSkeleton, FormSkeleton, HeaderSkeleton, LoadingShell, Skeleton } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando la tarea" className="max-w-3xl">
      <Skeleton className="mb-4 h-3.5 w-32" />
      <HeaderSkeleton actions={2} tabs={0} />
      <div className="flex flex-col gap-4">
        <BlockSkeleton rows={5} />
        <BlockSkeleton rows={3} />
        <FormSkeleton fields={4} />
      </div>
    </LoadingShell>
  );
}
