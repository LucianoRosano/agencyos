import { FormSkeleton, HeaderSkeleton, LoadingShell } from "@agencyos/ui";

export default function Loading() {
  return (
    <LoadingShell label="Cargando la configuración de IA" className="max-w-6xl">
      <HeaderSkeleton actions={0} tabs={3} />
      <FormSkeleton fields={4} />
    </LoadingShell>
  );
}
