import { isSetupDone } from "@agencyos/modules/setup/service";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Ingresar" };

export default async function LoginPage() {
  if (!(await isSetupDone())) redirect("/setup");
  const s = await getSession();
  if (s?.user.twoFactorEnabled) redirect("/hoy");
  if (s) redirect("/seguridad/2fa");
  return <LoginForm />;
}
