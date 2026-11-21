"use client";

import { useEffect } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global {
  interface Window {
    __agInstall?: InstallEvent | null;
  }
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    // El aviso de instalación llega una sola vez al cargar: se guarda para el botón «Instalar» de Configuración → App.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__agInstall = e as InstallEvent;
      window.dispatchEvent(new Event("ag:installable"));
    };
    const onInstalled = () => {
      window.__agInstall = null;
      window.dispatchEvent(new Event("ag:installable"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
