import { BoardSkeleton, HeaderSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el pipeline" className="max-w-[1920px]">
      <HeaderSkeleton actions={2} tabs={3} />
      <BoardSkeleton columns={4} />
    </LoadingShell>
  );
}
