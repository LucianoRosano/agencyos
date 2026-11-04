"use client";

import { Button, Field, Input } from "@agencyos/ui";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type Step = "password" | "totp" | "backup";

export function LoginForm() {
  const [step, setStep] = useState<Step>("password");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const { data, error } = await authClient.signIn.email({ email: String(fd.get("email")), password: String(fd.get("password")) });
    setPending(false);
    if (error) {
      setError(error.status === 429 ? "Demasiados intentos. Esperá unos minutos." : "Email o contraseña incorrectos.");
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setStep("totp");
      return;
    }
    window.location.href = "/seguridad/2fa";
  }

  async function onCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "");
    const res = step === "totp" ? await authClient.twoFactor.verifyTotp({ code, trustDevice: false }) : await authClient.twoFactor.verifyBackupCode({ code });
    setPending(false);
    if (res.error) {
      setError(res.error.status === 429 ? "Demasiados intentos. Esperá unos minutos." : "Código incorrecto.");
      return;
    }
    window.location.href = "/hoy";
  }

  if (step !== "password") {
    return (
      <form onSubmit={onCode} className="flex flex-col gap-4" key={step}>
        <div>
          <h1 className="text-xl font-semibold">Verificación en dos pasos</h1>
          <p className="mt-1 text-sm text-text-muted">
            {step === "totp" ? "Ingresá el código de 6 dígitos de tu app de autenticación." : "Ingresá uno de tus códigos de respaldo."}
          </p>
        </div>
        <Field label={step === "totp" ? "Código" : "Código de respaldo"} name="code" error={error ?? undefined}>
          <Input
            id="code"
            name="code"
            inputMode={step === "totp" ? "numeric" : "text"}
            autoComplete="one-time-code"
            autoFocus
            required
            className="font-mono tracking-[0.3em]"
            maxLength={step === "totp" ? 6 : 20}
          />
        </Field>
        <Button type="submit" variant="primary" loading={pending} className="w-full">
          Verificar
        </Button>
        <button
          type="button"
          className="text-[13px] text-text-muted underline-offset-2 hover:underline"
          onClick={() => setStep(step === "totp" ? "backup" : "totp")}
        >
          {step === "totp" ? "Usar un código de respaldo" : "Usar la app de autenticación"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onPassword} className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Ingresar</h1>
        <p className="mt-1 text-sm text-text-muted">Tu centro de mando te espera.</p>
      </div>
      <Field label="Email" name="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Contraseña" name="password" error={error ?? undefined}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" variant="primary" loading={pending} className="mt-1 w-full">
        Ingresar
      </Button>
      <Link href="/recuperar" className="text-center text-[13px] text-text-muted underline-offset-2 hover:underline">
        Olvidé mi contraseña
      </Link>
    </form>
  );
}
