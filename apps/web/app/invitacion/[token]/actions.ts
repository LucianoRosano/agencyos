"use server";

import { forbidden, type Result, toResultError } from "@agencyos/core";
import { getAuth } from "@agencyos/modules/auth/server";
import { acceptInvitationAsUser, acceptInvitationNewUser } from "@agencyos/modules/users/service";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/**
 * Invitado sin cuenta: crea la cuenta y deja la sesión iniciada. El token es la autorización (un solo uso).
 * Redirige desde el servidor: al iniciar sesión la página de la invitación ya no es válida (se consumió).
 */
export async function acceptNewAction(token: string, _prev: Result<null> | null, fd: FormData): Promise<Result<null>> {
  let to: string;
  try {
    const r = await acceptInvitationNewUser(token, Object.fromEntries(fd));
    await getAuth().api.signInEmail({ body: { email: r.email, password: r.password }, headers: await headers() });
    to = r.role === "client" ? "/portal" : "/seguridad/2fa";
  } catch (e) {
    return toResultError(e);
  }
  redirect(to);
}

/** Invitado con cuenta y sesión iniciada con el mismo email. */
export async function acceptExistingAction(token: string): Promise<Result<null>> {
  let to: string;
  try {
    const s = await getSession();
    if (!s) throw forbidden("Iniciá sesión para aceptar.");
    const r = await acceptInvitationAsUser(token, { id: s.user.id, name: s.user.name, email: s.user.email });
    to = r.role === "client" ? "/portal" : "/hoy";
  } catch (e) {
    return toResultError(e);
  }
  redirect(to);
}
