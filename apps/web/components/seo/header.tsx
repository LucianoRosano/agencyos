import { PageHeader, Tabs } from "@agencyos/ui";
import type { ReactNode } from "react";
import { SEO_ACCENT } from "./bits";

const TABS = [
  { key: "auditorias", label: "Auditorías", href: "/seo" },
  { key: "programadas", label: "Programadas", href: "/seo/programadas" },
  { key: "google", label: "API de Google", href: "/seo/google" },
];

export function SeoHeader({ active, actions, description }: { active: string; actions?: ReactNode; description?: string }) {
  return (
    <>
      <PageHeader
        eyebrow="SEO Auditor"
        title="SEO"
        accent={SEO_ACCENT}
        description={description ?? "Auditorías con datos reales: rastreo propio, robots.txt, sitemap, enlaces, PageSpeed y Core Web Vitals."}
        actions={actions}
      />
      <Tabs active={active} items={TABS} />
    </>
  );
}
