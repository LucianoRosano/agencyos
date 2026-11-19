import { FormSkeleton, HeaderSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el asistente" className="max-w-2xl">
      <HeaderSkeleton actions={0} tabs={0} />
      <FormSkeleton fields={5} />
    </LoadingShell>
  );
}
