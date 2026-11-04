"use client";

import { Button, Field, Input } from "@agencyos/ui";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function RequestReset({ emailOk }: { emailOk: boolean }) {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  if (!emailOk) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Recuperar contraseña</h1>
        <p className="text-sm text-text-muted">
          El envío de mails (Brevo) todavía no está configurado. Mientras tanto, la contraseña se restablece desde el servidor con:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px]">pnpm admin reset-password</pre>
        <Link href="/login" className="text-[13px] text-text-muted underline">Volver</Link>
      </div>
    );
  }
  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Revisá tu email</h1>
        <p className="text-sm text-text-muted">Si el email corresponde al dueño, te llegó un enlace que vence en 15 minutos.</p>
        <Link href="/login" className="text-[13px] text-text-muted underline">Volver</Link>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        await authClient.requestPasswordReset({ email: String(new FormData(e.currentTarget).get("email")), redirectTo: "/recuperar/nueva" });
        setPending(false);
        setSent(true);
      }}
    >
      <h1 className="text-xl font-semibold">Recuperar contraseña</h1>
      <Field label="Email del dueño" name="email">
        <Input id="email" name="email" type="email" required autoFocus />
      </Field>
      <Button type="submit" variant="primary" loading={pending}>Enviar enlace</Button>
      <Link href="/login" className="text-center text-[13px] text-text-muted underline">Volver</Link>
    </form>
  );
}
