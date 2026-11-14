import { PageHeader } from "@agencyos/ui";
import { requireCtx } from "@/lib/session";
import { SettingsTabs } from "./tabs";

export const metadata = { title: "Configuración" };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Sistema" title="Configuración" accent="#8A93A6" />
      <SettingsTabs full={ctx.role === "owner" || ctx.role === "admin"} />
      {children}
    </div>
  );
}
