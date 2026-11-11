import { PageHeader, Tabs } from "@agencyos/ui";
import type { ReactNode } from "react";
import { ASSETS_ACCENT } from "./shared";

export const ASSET_TABS = [
  { key: "resumen", label: "Resumen", href: "/activos" },
  { key: "dominios", label: "Dominios", href: "/activos/dominios" },
  { key: "hosting", label: "Hosting", href: "/activos/hosting" },
  { key: "certificados", label: "Certificados", href: "/activos/certificados" },
  { key: "credenciales", label: "Credenciales", href: "/activos/credenciales" },
  { key: "productos", label: "Productos propios", href: "/activos/productos" },
  { key: "monitoreo", label: "Monitoreo", href: "/activos/monitoreo" },
] as const;
export type AssetTab = (typeof ASSET_TABS)[number]["key"];

/** Encabezado común de Activos técnicos con pestañas. */
export function AssetsHeader({
  active,
  title,
  description,
  actions,
  counts = {},
}: {
  active: AssetTab;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  counts?: Partial<Record<AssetTab, number>>;
}) {
  return (
    <>
      <PageHeader eyebrow="Activos técnicos" title={title} description={description} accent={ASSETS_ACCENT} actions={actions} />
      <Tabs active={active} items={ASSET_TABS.map((t) => ({ key: t.key, label: t.label, href: t.href, count: counts[t.key] }))} />
    </>
  );
}
