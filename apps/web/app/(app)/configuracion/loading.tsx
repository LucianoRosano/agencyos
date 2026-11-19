import { BlockSkeleton, FormSkeleton, LoadingShell } from "@agencyos/ui";

/** El encabezado y las pestañas los pinta el layout de Configuración; acá solo el contenido. */
export default function Loading() {
  return (
    <LoadingShell label="Cargando la configuración" className="max-w-none gap-4">
      <FormSkeleton fields={4} />
      <BlockSkeleton rows={3} />
    </LoadingShell>
  );
}
