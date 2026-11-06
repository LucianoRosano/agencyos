"use client";

import { formatDateTime } from "@agencyos/core";
import { Button, Input } from "@agencyos/ui";
import { Fingerprint, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

type Pk = { id: string; name?: string | null; createdAt: Date | string; deviceType: string; backedUp: boolean };

/** Passkeys: huella, Face ID o llave física para entrar sin contraseña ni código. */
export function PasskeysSection() {
  const [items, setItems] = useState<Pk[]>([]);
  const [supported, setSupported] = useState(true);
  const [pending, setPending] = useState(false);

  async function load() {
    const { data } = await authClient.passkey.listUserPasskeys();
    setItems((data ?? []) as Pk[]);
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: carga inicial única
  useEffect(() => {
    setSupported(typeof window !== "undefined" && "PublicKeyCredential" in window);
    void load();
  }, []);

  return (
    <section className="md:max-w-md" data-testid="passkeys">
      <h3 className="mb-1 text-[15px] font-medium">Passkeys</h3>
      <p className="mb-3 text-[13px] text-text-muted">
        Entrá con la huella, Face ID o el bloqueo de pantalla del dispositivo, sin contraseña ni código. Valen como verificación en dos pasos.
      </p>
      {items.length ? (
        <ul className="mb-3 flex flex-col divide-y divide-border rounded-[10px] border border-border">
          {items.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-3 text-[14px]">
              <Fingerprint className="size-4 shrink-0 text-text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate">{p.name || "Passkey"}</p>
                <p className="font-mono text-[12px] text-text-faint">
                  {formatDateTime(new Date(p.createdAt))} · {p.backedUp ? "sincronizada" : "solo este dispositivo"}
                </p>
              </div>
              <button
                type="button"
                className="grid size-10 place-items-center rounded-md text-text-faint hover:bg-surface-2 hover:text-text"
                aria-label={`Eliminar ${p.name || "passkey"}`}
                onClick={async () => {
                  if (!confirm("¿Eliminar esta passkey? Vas a tener que entrar con contraseña y código en ese dispositivo.")) return;
                  const { error } = await authClient.passkey.deletePasskey({ id: p.id });
                  if (error) return toast.error("No se pudo eliminar");
                  toast.success("Passkey eliminada");
                  void load();
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {supported ? (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name") ?? "").trim() || "Mi dispositivo";
            setPending(true);
            const res = await authClient.passkey.addPasskey({ name });
            setPending(false);
            if (res?.error) return toast.error(res.error.message ?? "No se pudo registrar la passkey");
            toast.success("Passkey registrada");
            void load();
          }}
        >
          <Input name="name" placeholder="Nombre (p. ej. iPhone)" aria-label="Nombre de la passkey" maxLength={60} className="text-base md:text-sm" />
          <Button type="submit" loading={pending}>
            <Fingerprint className="size-4" /> Agregar
          </Button>
        </form>
      ) : (
        <p className="text-[13px] text-text-faint">Este navegador no admite passkeys.</p>
      )}
    </section>
  );
}
