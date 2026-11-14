import { isSetupDone } from "@agencyos/modules/setup/service";
import { emailConfigured } from "@agencyos/modules/shared/email";
import { redirect } from "next/navigation";
import { getSession, homeFor } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Ingresar" };

/** Solo rutas internas como destino después de entrar (evita redirecciones abiertas). */
const safeNext = (v: string | undefined) => (v && /^\/[a-z]/.test(v) && !v.startsWith("//") ? v : undefined);

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await isSetupDone())) redirect("/setup");
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const s = await getSession();
  let error: string | undefined;
  if (s) {
    const home = await homeFor(s.user.id);
    if (next?.startsWith("/invitacion/")) redirect(next);
    if (home === "/portal") redirect(next ?? "/portal");
    if (home && s.user.twoFactorEnabled) redirect(next ?? "/hoy");
    if (home) redirect("/seguridad/2fa");
    error = "Tu cuenta no tiene acceso activo. Si creés que es un error, escribile a Luciano.";
  } else if (sp.error === "sin-acceso") {
    error = "Tu acceso está desactivado o no existe. Si creés que es un error, escribile a Luciano.";
  }
  return <LoginForm next={next} initialError={error} magicLink={emailConfigured()} />;
}
