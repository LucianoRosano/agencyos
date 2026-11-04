"use client";

import { formatDateTime } from "@agencyos/core";
import { Button, Field, Input } from "@agencyos/ui";
import { LogOut, MonitorSmartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

type Session = { id: string; token: string; createdAt: Date; updatedAt: Date; userAgent?: string | null; ipAddress?: string | null };

function device(ua?: string | null) {
  if (!ua) return "Dispositivo desconocido";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Otro";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return `${br} · ${os}`;
}

export function SecurityPanel() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  async function load() {
    const [list, me] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
    setSessions((list.data ?? []) as Session[]);
    setCurrent(me.data?.session.token ?? null);
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h3 className="mb-2 text-[15px] font-medium">Sesiones activas</h3>
        <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 p-3 text-[14px]">
              <MonitorSmartphone className="size-4 text-text-muted" />
              <div className="flex-1">
                <p>{device(s.userAgent)} {s.token === current ? <span className="text-[12px] text-success">· esta sesión</span> : null}</p>
                <p className="font-mono text-[12px] text-text-faint">{formatDateTime(new Date(s.updatedAt))}{s.ipAddress ? ` · ${s.ipAddress}` : ""}</p>
              </div>
              {s.token !== current ? (
                <Button size="sm" variant="ghost" onClick={async () => { await authClient.revokeSession({ token: s.token }); toast.success("Sesión cerrada"); void load(); }}>Cerrar</Button>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={async () => { await authClient.revokeOtherSessions(); toast.success("Se cerraron las demás sesiones"); void load(); }}>Cerrar las demás sesiones</Button>
          <Button variant="danger" onClick={async () => { await authClient.signOut(); window.location.href = "/login"; }}><LogOut className="size-4" /> Cerrar sesión</Button>
        </div>
      </section>

      <section className="md:max-w-md">
        <h3 className="mb-2 text-[15px] font-medium">Cambiar contraseña</h3>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const form = e.currentTarget;
            if (fd.get("new") !== fd.get("new2")) return toast.error("Las contraseñas nuevas no coinciden");
            setPending(true);
            const { error } = await authClient.changePassword({ currentPassword: String(fd.get("current")), newPassword: String(fd.get("new")), revokeOtherSessions: true });
            setPending(false);
            if (error) return toast.error(error.message ?? "No se pudo cambiar la contraseña");
            toast.success("Contraseña actualizada; se cerraron las demás sesiones");
            form.reset();
          }}
        >
          <Field label="Contraseña actual" name="current"><Input id="current" name="current" type="password" autoComplete="current-password" required /></Field>
          <Field label="Nueva (mín. 12)" name="new"><Input id="new" name="new" type="password" autoComplete="new-password" minLength={12} required /></Field>
          <Field label="Repetir nueva" name="new2"><Input id="new2" name="new2" type="password" autoComplete="new-password" required /></Field>
          <Button type="submit" loading={pending} className="self-start">Cambiar contraseña</Button>
        </form>
      </section>

      <section className="md:max-w-md">
        <h3 className="mb-1 text-[15px] font-medium">Códigos de respaldo del 2FA</h3>
        <p className="mb-3 text-[13px] text-text-muted">Generar nuevos invalida los anteriores. Guardalos en Bitwarden.</p>
        {codes ? (
          <ul className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-warning/30 bg-warning-soft p-3 font-mono text-[13px]">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
        ) : null}
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const password = String(new FormData(e.currentTarget).get("password"));
            const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
            if (error || !data) return toast.error("Contraseña incorrecta");
            setCodes(data.backupCodes);
          }}
        >
          <Input name="password" type="password" placeholder="Tu contraseña" aria-label="Contraseña" required />
          <Button type="submit">Generar</Button>
        </form>
      </section>
    </div>
  );
}
