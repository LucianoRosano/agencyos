"use client";

import { type ComponentType, useEffect, useState } from "react";

type PaletteProps = { enabledModules: string[]; role?: string; initialOpen?: boolean };
type CaptureProps = { initialOpen?: boolean; initialText?: string };

const loadPalette = () => import("./command-palette").then((m) => m.CommandPalette as ComponentType<PaletteProps>);
const loadCapture = () => import("./capture-dialog").then((m) => m.CaptureDialog as ComponentType<CaptureProps>);

/**
 * Paleta de comandos (cmdk) y diálogo de captura fuera del JS inicial (presupuesto < 170 KB por ruta).
 * Se descargan cuando el navegador está ocioso o al primer uso (Ctrl/⌘ K, «C», botones); hasta entonces este
 * componente escucha los mismos eventos y, al cargar, monta el real ya abierto. Después el real maneja todo.
 */
export function LazyOverlays({ enabledModules, role, capture }: { enabledModules: string[]; role?: string; capture: boolean }) {
  const [Palette, setPalette] = useState<ComponentType<PaletteProps> | null>(null);
  const [Capture, setCapture] = useState<ComponentType<CaptureProps> | null>(null);
  const [openPalette, setOpenPalette] = useState(false);
  const [captureState, setCaptureState] = useState<{ open: boolean; text?: string }>({ open: false });

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const id = idle(() => {
      void loadPalette().then((c) => setPalette(() => c));
      if (capture) void loadCapture().then((c) => setCapture(() => c));
    });
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id as number);
  }, [capture]);

  // Mientras no cargó, atender los atajos y eventos para no perder el primer uso.
  useEffect(() => {
    if (Palette) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpenPalette(true);
        void loadPalette().then((c) => setPalette(() => c));
      }
    };
    const onOpen = () => {
      setOpenPalette(true);
      void loadPalette().then((c) => setPalette(() => c));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("ag:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ag:palette", onOpen);
    };
  }, [Palette]);

  useEffect(() => {
    if (Capture || !capture) return;
    const onOpen = () => {
      setCaptureState((s) => ({ ...s, open: true }));
      void loadCapture().then((c) => setCapture(() => c));
    };
    const onText = (e: Event) => setCaptureState((s) => ({ ...s, text: String((e as CustomEvent).detail ?? "") }));
    window.addEventListener("ag:capture", onOpen);
    window.addEventListener("ag:capture-text", onText);
    return () => {
      window.removeEventListener("ag:capture", onOpen);
      window.removeEventListener("ag:capture-text", onText);
    };
  }, [Capture, capture]);

  return (
    <>
      {Palette ? <Palette enabledModules={enabledModules} role={role} initialOpen={openPalette} /> : null}
      {Capture ? <Capture initialOpen={captureState.open} initialText={captureState.text} /> : null}
    </>
  );
}
