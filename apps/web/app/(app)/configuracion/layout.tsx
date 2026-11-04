import { PageHeader } from "@agencyos/ui";
import { SettingsTabs } from "./tabs";

export const metadata = { title: "Configuración" };

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Sistema" title="Configuración" accent="#8A93A6" />
      <SettingsTabs />
      {children}
    </div>
  );
}
