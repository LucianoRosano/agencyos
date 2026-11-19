import { FormSkeleton, HeaderSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando el formulario" className="max-w-2xl">
      <HeaderSkeleton actions={0} tabs={0} />
      <FormSkeleton fields={6} />
    </LoadingShell>
  );
}
