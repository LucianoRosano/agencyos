import { Card, SectionLabel } from "@agencyos/ui";
import { cookies } from "next/headers";
import Link from "next/link";
import { requireCtx } from "@/lib/session";
import { ProfileForm, ThemePicker } from "./profile-ui";

export default async function ProfilePage() {
  const ctx = await requireCtx();
  const theme = (await cookies()).get("ag-theme")?.value ?? "dark";
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <SectionLabel className="mb-4">Perfil</SectionLabel>
        <ProfileForm name={ctx.user.name} email={ctx.user.email} />
      </Card>
      <Card className="p-5">
        <SectionLabel className="mb-4">Apariencia</SectionLabel>
        <ThemePicker current={theme} />
      </Card>
      <Card className="p-5">
        <SectionLabel className="mb-3">Atajos</SectionLabel>
        <p className="text-[14px] text-text-muted">Apretá <kbd className="rounded border border-border px-1.5 font-mono text-[12px]">?</kbd> en cualquier pantalla para ver los atajos. Los espacios se administran en <Link href="/espacios" className="text-accent hover:underline">Espacios</Link> y lo eliminado está en la <Link href="/papelera" className="text-accent hover:underline">Papelera</Link>.</p>
      </Card>
    </div>
  );
}
