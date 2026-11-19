import { Card, SectionLabel } from "@agencyos/ui";
import { SecurityPanel } from "./security-panel";

export const metadata = { title: "Seguridad · Configuración" };

export default function SecurityPage() {
  return (
    <Card className="p-5">
      <SectionLabel className="mb-4">Seguridad de la cuenta</SectionLabel>
      <SecurityPanel />
    </Card>
  );
}
