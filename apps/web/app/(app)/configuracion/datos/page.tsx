import { can } from "@agencyos/core";
import { listAccounts } from "@agencyos/modules/finance/queries";
import { CLIENT_TEMPLATE, TX_TEMPLATE } from "@agencyos/modules/import/service";
import { Card, SectionLabel } from "@agencyos/ui";
import { requireCtx } from "@/lib/session";
import { ExportButton } from "./export-button";
import { ImportPanel } from "./import-ui";

export const metadata = { title: "Datos · Configuración" };

export default async function DataPage() {
  const ctx = await requireCtx();
  const canFinance = can(ctx, "create", "finance");
  const accounts = canFinance ? await listAccounts(ctx) : [];
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <SectionLabel className="mb-2">Importar desde CSV</SectionLabel>
        <p className="mb-4 text-[14px] text-text-muted">
          Traé tus clientes o los movimientos de un banco o de una planilla. Primero ves qué se va a crear y qué se saltea; nada se pisa.
        </p>
        <ImportPanel
          canFinance={canFinance}
          accounts={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))}
          templates={{ clientes: CLIENT_TEMPLATE, movimientos: TX_TEMPLATE }}
        />
      </Card>
      <Card className="p-5">
        <SectionLabel className="mb-2">Exportación total</SectionLabel>
        <p className="mb-4 text-[14px] text-text-muted">
          Un ZIP con todos tus datos en JSON (una tabla por archivo) y tus notas en Markdown compatibles con Obsidian. No incluye contraseñas ni tokens. Queda
          registrado en la auditoría.
        </p>
        <ExportButton />
      </Card>
    </div>
  );
}
