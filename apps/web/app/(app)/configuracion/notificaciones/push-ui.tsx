"use client";

import { Button, Checkbox } from "@agencyos/ui";
import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAction } from "@/components/use-action";
import { pushKeyAction, pushSubscribeAction, pushTestAction, pushUnsubscribeAction, setPreferenceAction } from "../actions";

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushToggle({ devices }: { devices: number }) {
  const [state, setState] = useState<"loading" | "unsupported" | "denied" | "off" | "on">("loading");
  const { exec, pending } = useAction();
  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !window.isSecureContext) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  async function enable() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
    const key = await pushKeyAction();
    if (!key.ok) return toast.error(key.error.message);
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key.data) });
    exec(() => pushSubscribeAction(sub.toJSON(), navigator.userAgent), {
      success: "Notificaciones activadas en este dispositivo",
      onDone: () => setState("on"),
    });
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await pushUnsubscribeAction(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
    toast.success("Notificaciones desactivadas en este dispositivo");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] text-text-muted">
        {state === "unsupported"
          ? "Este navegador no admite notificaciones push (en iPhone, primero instalá AGENCYOS en la pantalla de inicio). Requiere HTTPS."
          : state === "denied"
            ? "Bloqueaste las notificaciones para este sitio. Habilitalas desde la configuración del navegador."
            : state === "on"
              ? "Este dispositivo recibe notificaciones."
              : "Activá las notificaciones para enterarte de vencimientos, aprobaciones y el resumen diario."}
        {devices ? ` Dispositivos suscriptos: ${devices}.` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {state === "off" ? (
          <Button variant="primary" onClick={enable}>
            <BellRing className="size-4" /> Activar en este dispositivo
          </Button>
        ) : null}
        {state === "on" ? (
          <>
            <Button loading={pending} onClick={() => exec(() => pushTestAction(), { success: "Notificación de prueba enviada" })}>
              Enviar prueba
            </Button>
            <Button variant="ghost" onClick={disable}>
              Desactivar
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

type Ch = { inApp: boolean; push: boolean; email: boolean };
export function PreferencesTable({
  events,
  prefs,
  emailEnabled,
}: {
  events: { type: string; label: string }[];
  prefs: Record<string, Ch>;
  emailEnabled: boolean;
}) {
  const { exec } = useAction();
  const [state, setState] = useState<Record<string, Ch>>(
    Object.fromEntries(events.map((e) => [e.type, prefs[e.type] ?? { inApp: true, push: true, email: e.type === "resumen.diario" }])),
  );
  function toggle(type: string, k: keyof Ch) {
    const next = { ...(state[type] as Ch), [k]: !(state[type] as Ch)[k] };
    setState({ ...state, [type]: next });
    exec(() => setPreferenceAction(type, next));
  }
  return (
    <div className="overflow-hidden rounded-[10px] border border-border">
      <div className="grid grid-cols-[1fr_repeat(3,56px)] gap-2 border-b border-border bg-surface-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
        <span>Evento</span>
        <span className="text-center">App</span>
        <span className="text-center">Push</span>
        <span className="text-center">Mail</span>
      </div>
      {events.map((e) => (
        <div key={e.type} className="grid min-h-12 grid-cols-[1fr_repeat(3,56px)] items-center gap-2 border-b border-border px-3 last:border-0">
          <span className="text-[14px]">{e.label}</span>
          {(["inApp", "push", "email"] as const).map((k) => (
            <span key={k} className="grid place-items-center">
              <Checkbox
                checked={state[e.type]?.[k] ?? false}
                disabled={k === "email" && !emailEnabled}
                onChange={() => toggle(e.type, k)}
                aria-label={`${e.label}: ${k === "inApp" ? "en la app" : k}`}
                className="size-5"
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
