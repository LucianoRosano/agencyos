"use client";

import { Button } from "@agencyos/ui";
import { useState } from "react";
import { acceptShopInvitationAction, acceptShopInvitationAsUserAction } from "@/app/comercio/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TextField } from "@/components/fields";
import { getAuthClient } from "@/lib/auth-client-lazy";
import { toast } from "@/lib/toast";

export function AcceptNewUser({ token, name, email }: { token: string; name: string; email: string }) {
  return (
    <ActionForm
      action={acceptShopInvitationAction.bind(null, token)}
      onSuccess={async (d) => {
        const { email: e, password } = d as { email: string; password: string };
        const r = await (await getAuthClient()).signIn.email({ email: e, password });
        if (r.error) {
          toast.error("Cuenta creada: ingresá con tu email y contraseña.");
          window.location.href = "/login";
          return;
        }
        window.location.href = "/comercio";
      }}
    >
      <input type="hidden" name="email" value={email} readOnly />
      <TextField label="Tu nombre" name="name" required defaultValue={name} autoComplete="name" />
      <TextField label="Contraseña" name="password" type="password" required minLength={12} autoComplete="new-password" hint="Mínimo 12 caracteres." />
      <TextField label="Repetí la contraseña" name="password2" type="password" required minLength={12} autoComplete="new-password" />
      <SubmitButton className="w-full">Crear mi cuenta y entrar</SubmitButton>
    </ActionForm>
  );
}

export function AcceptAsUser({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="primary"
      loading={pending}
      onClick={async () => {
        setPending(true);
        const r = await acceptShopInvitationAsUserAction(token);
        setPending(false);
        if (!r.ok) return toast.error(r.error.message);
        window.location.href = "/comercio";
      }}
    >
      Aceptar y entrar
    </Button>
  );
}
