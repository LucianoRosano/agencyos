import { PageHeader, Tabs } from "@agencyos/ui";
import type { ReactNode } from "react";

export const CONTROL_ACCENT = "#22D3EE";

export function ControlHeader({ active, title, description, actions }: { active: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <>
      <PageHeader eyebrow="Sistema operativo de desarrollo" title={title} description={description} accent={CONTROL_ACCENT} actions={actions} />
      <Tabs
        active={active}
        items={[
          { key: "resumen", label: "Resumen", href: "/control" },
          { key: "objetivos", label: "Objetivos", href: "/control/objetivos" },
          { key: "skills", label: "Skills", href: "/control/skills" },
        ]}
      />
    </>
  );
}
