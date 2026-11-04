import { isSetupDone } from "@agencyos/modules/setup/service";
import { redirect } from "next/navigation";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Configuración inicial" };

export default async function SetupPage() {
  if (await isSetupDone()) redirect("/login");
  return (
    <>
      <h1 className="text-xl font-semibold">Configuración inicial</h1>
      <p className="mt-1 mb-6 text-sm text-text-muted">Creá la cuenta del dueño. Después vas a activar el 2FA (obligatorio).</p>
      <SetupForm needsToken={Boolean(process.env.SETUP_TOKEN) || process.env.NODE_ENV === "production"} />
    </>
  );
}
