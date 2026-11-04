import { Card, PageHeader } from "@agencyos/ui";
import { NewClientForm } from "@/components/crm/client-form";
import { CRM_ACCENT } from "@/components/crm/shared";
import { spaceOpts } from "@/lib/options";
import { requireCtx } from "@/lib/session";

export const metadata = { title: "Nuevo cliente" };

export default async function NewClientPage() {
  const ctx = await requireCtx();
  const spaces = await spaceOpts(ctx);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="CRM · Clientes"
        title="Nuevo cliente"
        description="Solo el nombre es obligatorio. Si cargás el contacto principal, queda vinculado y listo para escribirle."
        accent={CRM_ACCENT}
      />
      <Card className="p-5 md:p-6">
        <NewClientForm spaces={spaces} />
      </Card>
    </div>
  );
}
