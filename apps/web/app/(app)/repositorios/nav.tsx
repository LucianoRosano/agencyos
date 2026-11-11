import { Tabs } from "@agencyos/ui";

/** Sub-navegación de Repositorios (docs/06 §1: pestañas en el encabezado). */
export function ReposNav({ active, pending }: { active: "repos" | "planes"; pending?: number }) {
  return (
    <Tabs
      active={active}
      items={[
        { key: "repos", label: "Repositorios", href: "/repositorios" },
        { key: "planes", label: "Planes", href: "/repositorios/planes", count: pending || undefined },
      ]}
    />
  );
}
