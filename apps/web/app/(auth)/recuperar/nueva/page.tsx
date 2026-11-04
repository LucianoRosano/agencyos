"use client";

import { Button, Field, Input } from "@agencyos/ui";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { authClient } from "@/lib/auth-client";

function NewPassword() {
  const token = useSearchParams().get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const p1 = String(fd.get("password"));
        if (p1 !== String(fd.get("password2"))) return setError("Las contraseñas no coinciden.");
        setPending(true);
        const { error } = await authClient.resetPassword({ newPassword: p1, token });
        setPending(false);
        if (error) return setError(error.message ?? "El enlace venció o no es válido.");
        window.location.href = "/login";
      }}
    >
      <h1 className="text-xl font-semibold">Nueva contraseña</h1>
      <Field label="Contraseña nueva" name="password" hint="Mínimo 12 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} />
      </Field>
      <Field label="Repetir" name="password2" error={error ?? undefined}>
        <Input id="password2" name="password2" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" variant="primary" loading={pending}>
        Guardar
      </Button>
    </form>
  );
}

export default function Page() {
  return (
    <Suspense>
      <NewPassword />
    </Suspense>
  );
}
