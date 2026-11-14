"use client";

import { Button } from "@agencyos/ui";
import { useTransition } from "react";
import { toast } from "sonner";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TextField } from "@/components/fields";
import { authClient } from "@/lib/auth-client";
import { acceptExistingAction, acceptNewAction } from "./actions";

export function NewAccountForm({ token, email }: { token: string; email: string }) {
  return (
    <ActionForm<{ to: string }>
      action={acceptNewAction.bind(null, token)}
      successMessage="¡Listo! Tu cuenta quedó creada."
      onSuccess={(d) => {
        window.location.href = d.to;
      }}
    >
      <TextField label="Email" name="email_ro" value={email} readOnly autoComplete="username" />
      <TextField label="Tu nombre y apellido" name="name" autoComplete="name" required />
      <TextField label="Contraseña" name="password" type="password" autoComplete="new-password" required hint="Mínimo 12 caracteres." />
      <TextField label="Repetir contraseña" name="password2" type="password" autoComplete="new-password" required />
      <SubmitButton className="mt-1 w-full">Crear cuenta y entrar</SubmitButton>
    </ActionForm>
  );
}

export function AcceptExisting({ token }: { token: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="primary"
      className="w-full"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await acceptExistingAction(token);
          if (!r.ok) {
            toast.error(r.error.message);
            return;
          }
          window.location.href = r.data.to;
        })
      }
    >
      Aceptar invitación
    </Button>
  );
}

export function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      className="w-full"
      loading={pending}
      onClick={() =>
        start(async () => {
          await authClient.signOut();
          window.location.reload();
        })
      }
    >
      Cerrar sesión
    </Button>
  );
}
