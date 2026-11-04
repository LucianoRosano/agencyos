import { Card, SectionLabel } from "@agencyos/ui";
import { ExportButton } from "./export-button";

export default function DataPage() {
  return (
    <Card className="p-5">
      <SectionLabel className="mb-2">Exportación total</SectionLabel>
      <p className="mb-4 text-[14px] text-text-muted">
        Un ZIP con todos tus datos en JSON (una tabla por archivo) y tus notas en Markdown compatibles con Obsidian. No incluye contraseñas ni tokens. Queda
        registrado en la auditoría.
      </p>
      <ExportButton />
    </Card>
  );
}
