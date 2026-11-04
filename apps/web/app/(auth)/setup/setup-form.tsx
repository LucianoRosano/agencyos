"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { TextField } from "@/components/fields";
import { setupAction } from "./actions";

export function SetupForm({ needsToken }: { needsToken: boolean }) {
  return (
    <ActionForm action={setupAction} redirectTo="/seguridad/2fa" successMessage="Cuenta creada. Activá el 2FA.">
      <TextField label="Tu nombre" name="name" autoComplete="name" required defaultValue="Luciano Rosano" />
      <TextField label="Email" name="email" type="email" autoComplete="email" required defaultValue="lucianorosanott@gmail.com" />
      <TextField label="Contraseña" name="password" type="password" autoComplete="new-password" required hint="Mínimo 12 caracteres. Guardala en Bitwarden." />
      <TextField label="Repetir contraseña" name="password2" type="password" autoComplete="new-password" required />
      {needsToken ? (
        <TextField label="Código de instalación" name="token" autoComplete="off" required hint="Está en la variable SETUP_TOKEN del servidor." />
      ) : null}
      <SubmitButton className="mt-2 w-full">Crear cuenta</SubmitButton>
    </ActionForm>
  );
}
