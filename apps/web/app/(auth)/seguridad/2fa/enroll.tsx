"use client";

import { Button, Field, Input } from "@agencyos/ui";
import QRCode from "qrcode";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function EnrollTwoFactor() {
  const [step, setStep] = useState<"password" | "scan">("password");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string>("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const password = String(new FormData(e.currentTarget).get("password"));
    const { data, error } = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (error || !data || !("totpURI" in data)) {
      setError("Contraseña incorrecta.");
      return;
    }
    setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220, color: { dark: "#0B0D12", light: "#FFFFFF" } }));
    setSecret(new URL(data.totpURI).searchParams.get("secret") ?? "");
    setCodes(data.backupCodes);
    setStep("scan");
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "");
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) {
      setError("El código no coincide. Revisá la hora del celular y probá de nuevo.");
      return;
    }
    window.location.href = "/hoy";
  }

  if (step === "password") {
    return (
      <form onSubmit={start} className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">Activá la verificación en dos pasos</h1>
          <p className="mt-1 text-sm text-text-muted">Es obligatoria para el dueño. Necesitás una app como Google Authenticator, Aegis o la de Bitwarden.</p>
        </div>
        <Field label="Confirmá tu contraseña" name="password" error={error ?? undefined}>
          <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
        </Field>
        <Button type="submit" variant="primary" loading={pending} className="w-full">
          Continuar
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Escaneá el código</h1>
        <p className="mt-1 text-sm text-text-muted">Escanealo con tu app de autenticación y escribí el código de 6 dígitos.</p>
      </div>
      {qr ? (
        // biome-ignore lint/performance/noImgElement: data URL generada en el cliente
        <img src={qr} alt="Código QR para configurar el 2FA" width={220} height={220} className="mx-auto rounded-lg" />
      ) : null}
      <p className="break-all text-center font-mono text-[12px] text-text-muted">Clave manual: {secret}</p>
      <div className="rounded-lg border border-warning/30 bg-warning-soft p-3">
        <p className="mb-2 text-[13px] font-medium text-warning">Códigos de respaldo (se muestran una sola vez)</p>
        <ul className="grid grid-cols-2 gap-1 font-mono text-[13px] text-text">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-text-muted">Guardalos en Bitwarden.</p>
      </div>
      <Field label="Código de 6 dígitos" name="code" error={error ?? undefined}>
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="font-mono tracking-[0.3em]" />
      </Field>
      <Button type="submit" variant="primary" loading={pending} className="w-full">
        Activar 2FA
      </Button>
    </form>
  );
}
