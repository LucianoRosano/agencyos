import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { EnrollTwoFactor } from "./enroll";

export const metadata = { title: "Activar 2FA" };

export default async function TwoFactorPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.user.twoFactorEnabled) redirect("/hoy");
  return <EnrollTwoFactor />;
}
