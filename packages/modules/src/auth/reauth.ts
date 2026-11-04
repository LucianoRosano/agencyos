import { validation } from "@agencyos/core";
import { getAuth } from "./server";

/** Reautenticación para acciones críticas (docs/08 §2): verifica la contraseña del usuario. */
export async function verifyPassword(userId: string, password: string): Promise<void> {
  if (!password) throw validation("Confirmá tu contraseña", { password: "Obligatoria" });
  const actx = await getAuth().$context;
  const accounts = await actx.internalAdapter.findAccounts(userId);
  const cred = accounts.find((a) => a.providerId === "credential" && a.password);
  if (!cred?.password || !(await actx.password.verify({ hash: cred.password, password }))) {
    throw validation("Contraseña incorrecta", { password: "Contraseña incorrecta" });
  }
}

/** Restablece la contraseña desde el servidor (CLI de administración), sin email. */
export async function adminSetPassword(email: string, newPassword: string): Promise<void> {
  if (newPassword.length < 12) throw validation("Mínimo 12 caracteres");
  const actx = await getAuth().$context;
  const user = await actx.internalAdapter.findUserByEmail(email.toLowerCase());
  if (!user) throw validation("No existe un usuario con ese email");
  const hash = await actx.password.hash(newPassword);
  await actx.internalAdapter.updatePassword(user.user.id, hash);
  await actx.internalAdapter.deleteUserSessions(user.user.id);
}
